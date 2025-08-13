import { ReplacementOption } from "@vscode/extension-telemetry";

export class TelemetryFilter {
    public static hideUrlOption: ReplacementOption = {
        lookup: /https?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g, // match URLs with embedded credentials
        replacementString: "<REDACTED: sensitive-url>",
    };
}
