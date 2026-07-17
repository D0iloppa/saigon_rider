import { spawn } from "node:child_process";

const checks = [
  {
    name: "agents-contract",
    args: ["run", "check:contract"]
  },
  {
    name: "client-eslint",
    args: ["--filter", "client", "lint"]
  },
  {
    name: "server-eslint",
    args: ["--filter", "server", "lint"]
  },
  {
    name: "client-types",
    args: ["exec", "tsc", "-p", "apps/client/tsconfig.app.json", "--noEmit"]
  },
  {
    name: "server-types",
    args: ["exec", "tsc", "-p", "apps/server/tsconfig.json", "--noEmit"]
  }
];

function runCheck(check) {
  return new Promise((resolve) => {
    console.log(`\n> lint:${check.name}`);

    const child = spawn("pnpm", check.args, {
      cwd: new URL("..", import.meta.url),
      shell: process.platform === "win32",
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", (error) => {
      console.error(`[lint:${check.name}] ${error.message}`);
      resolve(1);
    });
  });
}

const results = [];

for (const check of checks) {
  const code = await runCheck(check);
  results.push({ ...check, code });
}

const failed = results.filter((result) => result.code !== 0);

if (failed.length > 0) {
  console.error(`\nLint failed: ${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}

console.log("\nLint passed.");
