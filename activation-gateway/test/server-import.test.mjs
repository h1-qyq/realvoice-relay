import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";


test("server module can be imported when argv[1] is absent", () => {
  const result = spawnSync(
    process.execPath,
    ["-e", "import('./src/server.mjs').then(() => console.log('imported'))"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /imported/);
});

