"""Typed, executable scientific graph. No arbitrary code/executable nodes."""

from typing import Any, Literal

from pydantic import Field

from .methods import ReconstructionOptions
from .models import (
    BubbleSettings,
    Config,
    CouplingSettings,
    JWaveSettings,
    ProcessingSettings,
    ReceiveArray,
    Source,
    StrictModel,
)

PORTS = {
    "drive": ({}, {"out": "drive"}),
    "analytic_source": ({"drive": "drive"}, {"out": "source"}),
    "bubble": ({"drive": "drive"}, {"out": "bubble"}),
    "coupler": ({"curve": "bubble"}, {"out": "source"}),
    "scene": ({}, {"out": "scene"}),
    "ct": ({"scene": "scene"}, {"out": "scene"}),
    "probe": ({}, {"out": "probe"}),
    "analytic": ({"source": "source", "scene": "scene", "probe": "probe"}, {"out": "rf"}),
    "jwave": ({"source": "source", "scene": "scene", "probe": "probe"}, {"out": "rf"}),
    "monopole": ({"curve": "bubble", "scene": "scene", "probe": "probe"}, {"out": "rf"}),
    "reconstruct": ({"rf": "rf"}, {"out": "map"}),
    "dsp": ({"rf": "rf"}, {"out": "rf"}),
    "rf_scope": ({"in": "rf"}, {}),
    "bubble_scope": ({"in": "bubble"}, {}),
    "map_scope": ({"in": "map"}, {}),
}


class Node(StrictModel):
    id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,39}$")
    kind: Literal[
        "drive",
        "analytic_source",
        "bubble",
        "coupler",
        "scene",
        "ct",
        "probe",
        "analytic",
        "jwave",
        "monopole",
        "reconstruct",
        "dsp",
        "rf_scope",
        "bubble_scope",
        "map_scope",
    ]
    x: float = Field(ge=-4000, le=8000)
    y: float = Field(ge=-4000, le=8000)
    label: str = Field(default="", max_length=60)
    method: Literal["das", "tea", "cf", "rcb", "atp"] = "das"


class Edge(StrictModel):
    source: str = Field(max_length=40)
    target: str = Field(max_length=40)
    port: str = Field(max_length=20)


class Workflow(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    nodes: list[Node] = Field(max_length=48)
    edges: list[Edge] = Field(max_length=96)
    analysis: ReconstructionOptions | None = None


class WorkflowRequest(StrictModel):
    workflow: Workflow
    config: dict[str, Any]
    options: ReconstructionOptions


def compile_graph(body):
    graph = body.workflow
    nodes = {n.id: n for n in graph.nodes}
    if len(nodes) != len(graph.nodes):
        raise ValueError("Duplicate block identifiers")
    incoming, outgoing = {key: {} for key in nodes}, {key: [] for key in nodes}
    seen = set()
    for edge in graph.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise ValueError("A connection references a missing block")
        source, target = nodes[edge.source], nodes[edge.target]
        output = PORTS[source.kind][1].get("out")
        if output is None or PORTS[target.kind][0].get(edge.port) != output:
            raise ValueError(f"Incompatible connection: {source.kind} → {target.kind}.{edge.port}")
        key = (edge.source, edge.target, edge.port)
        if key in seen:
            raise ValueError("Duplicate connection")
        seen.add(key)
        if edge.port in incoming[target.id] and target.kind != "map_scope":
            raise ValueError(f"{target.label or target.kind}.{edge.port} already has an input")
        incoming[target.id][edge.port] = source.id
        outgoing[source.id].append(target.id)
    pending = {key: sum(1 for e in graph.edges if e.target == key) for key in nodes}
    queue = [key for key, value in pending.items() if value == 0]
    order = []
    while queue:
        key = queue.pop(0)
        order.append(key)
        for other in outgoing[key]:
            pending[other] -= 1
            if not pending[other]:
                queue.append(other)
    if len(order) != len(nodes):
        raise ValueError("Workflow contains a cycle")
    for node in graph.nodes:
        missing = set(PORTS[node.kind][0]) - set(incoming[node.id])
        if missing:
            raise ValueError(f"{node.label or node.kind}: connect {', '.join(sorted(missing))}")
        if PORTS[node.kind][1] and not outgoing[node.id]:
            raise ValueError(f"{node.label or node.kind}: output is disconnected")
    propagators = [n for n in graph.nodes if n.kind in ("analytic", "jwave", "monopole")]
    if len(propagators) != 1:
        raise ValueError("Use exactly one propagation block per workflow")
    for kind in ("drive", "scene", "probe"):
        if sum(n.kind == kind for n in graph.nodes) != 1:
            raise ValueError(f"Use exactly one {kind} block")
    for kind in ("bubble", "analytic_source", "coupler", "dsp", "ct"):
        if sum(n.kind == kind for n in graph.nodes) > 1:
            raise ValueError(
                f"Only one {kind} block is supported; use source positions for independent copies"
            )
    prop = propagators[0]
    raw = dict(body.config)
    ct_nodes = [n for n in graph.nodes if n.kind == "ct"]
    raw.pop("ct", None)
    scene_node = next(n for n in graph.nodes if n.kind == "scene")
    if ct_nodes:
        ct_node = ct_nodes[0]
        if (
            prop.kind != "jwave"
            or incoming[ct_node.id]["scene"] != scene_node.id
            or incoming[prop.id]["scene"] != ct_node.id
            or not body.config.get("ct")
        ):
            raise ValueError("Connect Acoustic scene → CT medium → j-Wave and load a CT asset")
        raw["ct"] = body.config["ct"]
    processors = [n for n in graph.nodes if n.kind == "dsp"]
    raw.pop("processing", None)
    rf_source = prop.id
    if processors:
        processor = processors[0]
        if incoming[processor.id]["rf"] != prop.id:
            raise ValueError("Receive conditioning must follow the propagation RF")
        rf_source = processor.id
        fs = body.config.get("sampling_hz", 20e6)
        raw["processing"] = (
            body.config.get("processing")
            or ProcessingSettings(
                remove_dc=True,
                filter_kind="bandpass",
                low_hz=min(0.2e6, fs * 0.1),
                high_hz=min(2e6, fs * 0.4),
            ).model_dump()
        )
    if any(incoming[n.id]["rf"] != rf_source for n in graph.nodes if n.kind == "reconstruct"):
        raise ValueError(
            "All reconstruction blocks must share the same raw or conditioned RF output"
        )
    for key in ("simulation", "bubble", "coupling"):
        raw.pop(key, None)
    has_bubble = any(n.kind == "bubble" for n in graph.nodes)
    has_coupler = any(n.kind == "coupler" for n in graph.nodes)
    if prop.kind == "jwave":
        raw["simulation"] = body.config.get("simulation") or JWaveSettings().model_dump()
    if has_bubble:
        raw.update(
            bubble=body.config.get("bubble") or BubbleSettings().model_dump(),
            gate_stride=1,
            emission_kind="pulse",
            bandpass_hz=None,
            spreading=prop.kind == "monopole",
        )
    if has_coupler:
        if not has_bubble or prop.kind != "jwave":
            raise ValueError("Volume-flow coupling connects jbubble to j-Wave only")
        raw["coupling"] = body.config.get("coupling") or CouplingSettings().model_dump()
    if has_bubble != (prop.kind == "monopole" or has_coupler):
        raise ValueError("Connect bubble output to the monopole bridge or to coupling → j-Wave")
    methods = [n.method for n in graph.nodes if n.kind == "reconstruct"]
    if not methods or len(set(methods)) != len(methods):
        raise ValueError("Use one reconstruction block per selected method (at least one)")
    cfg = Config.model_validate(raw)
    if cfg.simulation:
        from .jwave_adapter import plan

        plan(cfg)
    if (
        cfg.arrays
        and len(cfg.arrays) > 1
        and "rcb" in methods
        and len(cfg.active_channels or range(cfg.channels)) > 64
    ):
        raise ValueError(
            "RCB on multiple arrays requires at most 64 active channels; edit the receiver mask or remove RCB"
        )
    options = ReconstructionOptions.model_validate(
        {**body.options.model_dump(), "methods": methods}
    )
    if cfg.coupling and options.atp_timing_known:
        from .coupling import filter_spec

        fs, count, _ = filter_spec(cfg)
        options = options.model_copy(
            update={"atp_emission_s": options.atp_emission_s + (count - 1) / (2 * fs)}
        )
    return (
        cfg,
        options,
        {
            "order": order,
            "methods": methods,
            "pipeline": "jbubble → volume flow → j-Wave → RF → PAM"
            if cfg.coupling
            else f"{prop.kind} → RF → PAM",
            "config": cfg.model_dump(),
            "options": options.model_dump(),
        },
    )


def coupled_template():
    nodes, edges = [], []

    def add(id, kind, x, y, method="das"):
        nodes.append(Node(id=id, kind=kind, x=x, y=y, method=method))

    def wire(source, target, port):
        edges.append(Edge(source=source, target=target, port=port))

    add("drive", "drive", 40, 40)
    add("scene", "scene", 40, 230)
    add("probe", "probe", 260, 230)
    add("source", "bubble", 260, 40)
    wire("drive", "source", "drive")
    add("bubble_scope", "bubble_scope", 480, 230)
    wire("source", "bubble_scope", "in")
    add("coupler", "coupler", 480, 40)
    wire("source", "coupler", "curve")
    add("prop", "jwave", 700, 40)
    wire("coupler", "prop", "source")
    wire("scene", "prop", "scene")
    wire("probe", "prop", "probe")
    add("rf_scope", "rf_scope", 700, 230)
    wire("prop", "rf_scope", "in")
    for i, method in enumerate(("das", "tea", "cf", "rcb", "atp")):
        add(f"method_{method}", "reconstruct", 40 + i * 220, 430, method)
        wire("prop", f"method_{method}", "rf")
        wire(f"method_{method}", "maps", "in")
    add("maps", "map_scope", 480, 620)
    cfg = Config(
        channels=32,
        arrays=[
            ReceiveArray(name="Array 1", elements=16, x_m=-0.003),
            ReceiveArray(name="Array 2", elements=16, x_m=0.009, z_m=0.008, angle_deg=90),
        ],
        sampling_hz=10e6,
        samples=512,
        frequency_hz=0.5e6,
        sources=[Source(z_m=0.012)],
        grid_n=65,
        grid_x_min_m=-0.008,
        grid_x_max_m=0.012,
        grid_z_min_m=0.004,
        grid_z_max_m=0.02,
        gate_stride=1,
        gate_end_s=36e-6,
        bubble=BubbleSettings(drive_pa=20e3, ringdown_cycles=4),
        simulation=JWaveSettings(spacing_m=0.00025),
        coupling=CouplingSettings(passband_hz=0.7e6),
    )
    return (
        Workflow(nodes=nodes, edges=edges),
        cfg,
        ReconstructionOptions(methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True),
    )
