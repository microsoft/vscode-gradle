import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { GET_EXTENSION_PATH } from '../constant';
export async function generateRandomPipeName(type: string): Promise<string> {
    const randomSuffix =  randomBytes(11).toString('hex');
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\${randomSuffix}-${type}-sock`;
    } else {
        const extensionPath = await vscode.commands.executeCommand<string>(GET_EXTENSION_PATH)
        return `${extensionPath}/${randomSuffix}-${type}.sock`;
    }
}

