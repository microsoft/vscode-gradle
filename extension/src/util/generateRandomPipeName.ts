// See: https://github.com/microsoft/vscode-languageserver-node/blob/6d0454dca7fba8529ba3fc6d930642f134291d3d/jsonrpc/src/node/main.ts#L176
import { randomBytes } from "crypto";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
const safeIpcPathLengths: Map<NodeJS.Platform, number> = new Map([
    ["linux", 107],
    ["darwin", 103],
]);

// TODO: remove this function after upgrading vscode-languageclient
function generateRandomPipeName(): string {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\${randomBytes(16).toString("hex")}-sock`;
    }

    let randomLength = 32;
    const fixedLength = ".sock".length;
    const tmpDir: string = fs.realpathSync(XDG_RUNTIME_DIR ?? os.tmpdir());
    const limit = safeIpcPathLengths.get(process.platform);
    if (limit !== undefined) {
        randomLength = Math.min(limit - tmpDir.length - fixedLength, randomLength);
    }
    if (randomLength < 16) {
        throw new Error(`Unable to generate a random pipe name with ${randomLength} characters.`);
    }

    const randomSuffix = randomBytes(Math.floor(randomLength / 2)).toString("hex");
    return path.join(tmpDir, `${randomSuffix}.sock`);
}

export function getRandomPipeName(): string {
    let pipeName = "";
    try {
        pipeName = generateRandomPipeName();
    } catch (error) {
        sendInfo("", {
            kind: "generateRandomPipeNameError",
        });
    }
    return pipeName;
}
