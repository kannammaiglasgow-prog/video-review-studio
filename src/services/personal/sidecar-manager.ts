import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

let workerProcess: ChildProcess | null = null;
const WORKER_PORT = 5005;

export function requestLocalHost(method: "GET" | "POST", pathName: string, payload?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : "";
    const options = {
      hostname: "127.0.0.1",
      port: WORKER_PORT,
      path: pathName,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 300_000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Server returned HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse JSON response"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

export async function isSidecarHealthy(): Promise<boolean> {
  try {
    const data = await requestLocalHost("GET", "/health");
    return data.status === "healthy";
  } catch {
    return false;
  }
}

export async function startSidecar(): Promise<void> {
  const healthy = await isSidecarHealthy();
  if (healthy) {
    console.log("✓ Local AI sidecar worker is already running and healthy.");
    return;
  }

  const rootDir = path.resolve(process.cwd());
  const userVenvPython = "C:/Users/kanna/indic-parler-tts/.venv/Scripts/python.exe";
  const defaultVenvPython = path.join(rootDir, ".venv-media-worker", "Scripts", "python.exe");
  const scriptPath = path.join(rootDir, "src", "services", "personal", "worker.py");

  let pythonPath = "python";
  if (fs.existsSync(userVenvPython)) {
    pythonPath = userVenvPython;
  } else if (fs.existsSync(defaultVenvPython)) {
    pythonPath = defaultVenvPython;
  } else {
    console.warn("⚠️ Local python virtual environment not found. Falling back to system python.");
  }

  console.log(`Starting Local AI Sidecar: ${pythonPath} -u ${scriptPath} ${WORKER_PORT}`);

  // Use '-u' flag to force python stdout/stderr to be unbuffered
  workerProcess = spawn(pythonPath, ["-u", scriptPath, String(WORKER_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    }
  });

  workerProcess.stdout?.on("data", (chunk) => {
    console.log(`[Python Sidecar]: ${String(chunk).trim()}`);
  });

  workerProcess.stderr?.on("data", (chunk) => {
    console.error(`[Python Sidecar Error]: ${String(chunk).trim()}`);
  });

  workerProcess.on("close", (code) => {
    console.log(`[Python Sidecar] process exited with code ${code}`);
    workerProcess = null;
  });

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isSidecarHealthy()) {
      console.log("✓ Local AI sidecar worker started successfully.");
      return;
    }
  }

  throw new Error("Local AI sidecar worker failed to start or did not become healthy within 20 seconds.");
}

export function stopSidecar(): void {
  if (workerProcess) {
    console.log("Stopping Local AI Sidecar worker...");
    workerProcess.kill();
    workerProcess = null;
  }
}

export async function callSidecar(endpoint: string, payload: unknown): Promise<any> {
  const healthy = await isSidecarHealthy();
  if (!healthy) {
    await startSidecar();
  }

  return requestLocalHost("POST", `/${endpoint.replace(/^\//, "")}`, payload);
}
