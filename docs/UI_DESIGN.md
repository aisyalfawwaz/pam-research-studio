# Instrument workspace redesign — 2026-11-11

The active interface is one desktop workspace. Scene, Model builder, Live simulation, Bubble dynamics, RF data, reconstruction and run history are documents; Project, Properties and Output are utility panels. There is no landing-page dashboard, marketing copy, decorative card grid or invented activity graph.

## Layout and commands

- File/Edit/View/Simulation/Analysis/Help menus expose working commands with keyboard shortcuts.
- The toolbar groups file operations, undo/redo, preset/simulation/reconstruction/stop, export and panel visibility.
- Left: actual model objects, RF runs and calculated method outputs. Right: compact property rows with label, numeric value and unit. Bottom: Messages, Measurements and Run info.
- Splitters support pointer and keyboard adjustment. Visibility, dimensions and theme are persisted locally. Reset layout is available.
- Light desktop surfaces, Segoe UI text, restrained blue selection and monospaced numeric values. Dark theme updates UI and plot colours consistently. No gradients or decorative elevation outside native-style menus/dialogs.

## Scientific interaction

Bubble dynamics (0.9) is a full-width motion inspector. A fixed-scale spherical section and instantaneous radial/shell values sit beside four synchronized traces. Slow-motion playback follows the stored physical clock; event controls stay above scrolling content and keyboard/slider controls seek the same trajectory. Coating styling distinguishes nominal buckled, elastic and rupture regimes from the saved smooth law. A brief caption identifies unresolved fragmentation; no decorative debris or unrelated oscillation is shown. Leaving the document restores the normal panels.

The Benchmark document evaluates saved results in a compact numerical table, with selectable current/reference run, physical truth-disk radius and histogram bin count. Four primary readouts lead into all-method rows and paired maps with ROI/peak overlays. Pixel counts, undefined metrics and sample/boundary limitations are visible; changed RF/settings receive an explicit scenario label. CSV/JSON exports contain real scores and provenance. It preserves the instrument typography, restrained colours and keyboard controls; local ROI/bin preferences survive document switching.

Geometry supports pointer/keyboard source editing, explicit numeric coordinates and equal-axis-scale control. RF overview selects a channel; waveform/spectrum show full-resolution data. Map inspection supports zoom, pan, fit, coordinate readout, truth/peak markers and selected profiles. Result tabs switch methods; Tile displays computed maps together. Measurements remain numerical, independent of plot appearance.

Version 0.4 adds typed scientific blocks and visible data ports, graph validation and F7 execution. Port colours distinguish RF, map and source data; reconstructions consume the shared RF in parallel. Double-click opens real parameters. The canvas fits and centres on resize; graph operations support keyboard and undo/redo. Receiver arrays can be selected, dragged and numerically dimensioned; generous hit targets and preserved pointer offsets make positioning predictable. One gesture is one undo operation.

The Live document uses four instrument panes for radial bubble size, actual pressure, sensor RF and computed PAM. Field axes use equal physical scale. Replay controls expose saved solver samples and label the completed map Final PAM. Uncomputed pixels are hatched. Captions explain radial/2D/one-way assumptions and distinguish simulation time from wall time. Display decimation never changes the RF used for reconstruction.

Acquisition and reconstruction controls have different effects. Grid/gate/aperture changes reuse RF. Source/medium/acquisition changes require a new simulation and disable reconstruction against stale RF. Completed runs stay frozen; changes create a new result. Raw-data export choice is explicit.

## Copy and accessibility

Version 0.8 restores the user's Project/Properties/Output panel choices when leaving wide CT/Live/Benchmark documents. Calculation completion preserves a document selected during execution. Benchmark has direct saved-PAM/RF navigation, per-project run/reference/method/sort choices, a changed-parameter table and signed score deltas. Changing a numeric evaluation setting does not reload unchanged map rasters. Pending or unavailable signals have explicit status; raw and conditioned overview buffers are associated with their run IDs to avoid showing a previous experiment's RF during a switch.

Labels name the object or operation: “Simulate”, “Reconstruct”, “Gate start”, “Sample rate”. Status reports actual state rather than promises. Timing and uncertainty requirements appear with the relevant method, not as repeated slogans. No “two methods, one immutable input” or “reproducible evidence” headings remain.

Controls have accessible names, visible keyboard focus, appropriate tabs/menu roles and units. Plot cursors support arrow keys; resizers also support keyboard adjustment. Relevant source properties scroll into view on selection. Errors are summarized inline and retained in Messages.

## References used for interaction structure

- [MATLAB desktop layout](https://www.mathworks.com/help/matlab/matlab_env/change-the-desktop-layout.html): persistent tool panels and an editing/figure workspace.
- [KiCad UI policy](https://dev-docs.kicad.org/en/rules-guidelines/ui/index.html) and [schematic editor documentation](https://docs.kicad.org/master/en/eeschema/eeschema.html): direct manipulation, property editing and contextual tools.
- [NI front-panel documentation](https://www.ni.com/en/support/documentation/supplemental/08/labview-front-panel-explained.html): distinguish numeric controls, indicators and execution tools.

These informed the desktop interaction model. No vendor assets, branding or source code are copied.
