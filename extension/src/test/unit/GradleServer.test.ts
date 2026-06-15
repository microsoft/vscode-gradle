import * as assert from "assert";
import * as sinon from "sinon";
import { SinonStub } from "sinon";
import * as vscode from "vscode";
import { GradleServer } from "../../server";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

describe(suiteName("GradleServer recovery"), () => {
    afterEach(() => {
        sinon.restore();
    });

    it("deduplicates concurrent restart prompts", async () => {
        let resolvePrompt: (selection: string | undefined) => void = () => undefined;
        const promptSelection = new Promise<string | undefined>((resolve) => {
            resolvePrompt = resolve;
        });
        const showErrorMessageStub = (sinon.stub(vscode.window, "showErrorMessage") as SinonStub).returns(
            promptSelection
        );
        const server = Object.create(GradleServer.prototype) as GradleServer;

        const firstPrompt = server.showRestartMessage("first failure");
        const secondPrompt = server.showRestartMessage("second failure");

        assert.strictEqual(showErrorMessageStub.calledOnce, true);
        resolvePrompt(undefined);
        await Promise.all([firstPrompt, secondPrompt]);
        assert.strictEqual(showErrorMessageStub.calledOnce, true);
    });
});
