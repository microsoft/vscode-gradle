import {window, workspace, commands, ExtensionContext, QuickPickItem, OutputChannel, Disposable} from 'vscode'; 
import * as proc from 'child_process'

var cacheNeeded: boolean = true;

var TaskCache: QuickPickItem[] = [];
var outputChannel: OutputChannel = null;

export function activate(context: ExtensionContext) {
	// const cwd = workspace.rootPath;
	outputChannel = window.createOutputChannel("Gradle")
	const disposable = commands.registerCommand('gradle', () => {
		
		return window.showQuickPick(list()).then((task: QuickPickItem) => {
			var statusbar: Disposable = window.setStatusBarMessage("Running...")
			outputChannel.show();
			var process = proc.exec(
				cmd() + " " + task.label, 
				{cwd: workspace.rootPath}, 
				(err, stdout, stderr) => {
					if (err) window.showErrorMessage("An error occured");
					else window.showInformationMessage("Success!");
					outputChannel.append(stdout);
				});
			process.stdout.on("data", data => outputChannel.append(data.toString()));
			process.stderr.on("data", data => outputChannel.append("[ERR] " + data));
			statusbar.dispose(); 
		})
	});

	context.subscriptions.push(disposable);
} 

function cmd(): string { return workspace.getConfiguration().get("gradle.useCommand", "gradlew"); }

function list(): Thenable<QuickPickItem[]> {
	const regex = /$\s*([a-z0-9]+)\s-\s(.*)$/mgi;
	
	return new Promise(resolve => {
		if (cacheNeeded) {
			outputChannel.show(); 
			var process = proc.exec(cmd() + " tasks", {cwd: workspace.rootPath}, (err, stdout, stderr) => {
				if (err) { return resolve([])}
				var match: RegExpExecArray;
				var items: QuickPickItem[] = [];

				while ((match = regex.exec(stdout.toString())) !== null) {
					items.push({
						label: match[1],
						description: match[2], 
					})
				} 
				
				TaskCache = items;
				// cacheNeeded = false; //Maybe I'll implement this later...
				return resolve(items);
			});
			process.stdout.on("data", data => outputChannel.append(data.toString()));
			process.stderr.on("data", data => outputChannel.append("[ERR] " + data));
			
		}
		else return resolve(TaskCache);
	})
}