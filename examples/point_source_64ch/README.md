# 64-channel reproducible synthetic fixture

`experiment.zip` and `bundle/` contain the same real generated experiment, including raw RF by explicit choice during fixture generation. Verify/reproduce from the repository root:

```powershell
uv run python -m pamstudio.cli reproduce examples/point_source_64ch/bundle
```

Use the desktop's Experiments → Import experiment ZIP to inspect it in a project. The source position is x=0, z=30 mm. DAS and TEA-style use a shared 128² grid. See the root BUILD_REPORT.md for measured metrics and timing; see bundle/METHODS.md for precise definitions and limitations. File hashes are in bundle/manifest.json. No experimental or patient recordings are included.
