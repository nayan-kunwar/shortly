// Container healthcheck probe: GETs /ready on the container's own PORT.
// Exit 0 = healthy, 1 = not. No shell quoting involved (see M16 doc).
const port = process.env['PORT'] || '3000';
fetch(`http://localhost:${port}/ready`)
  .then((res) => process.exit(res.ok ? 0 : 1))
  .catch(() => process.exit(1));
