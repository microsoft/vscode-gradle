import {window, workspace, commands, ExtensionContext, QuickPickItem} from 'vscode'; 
import * as proc from 'child_process'

var cacheNeeded: boolean = true;

var TaskCache: QuickPickItem[] = [];

export function activate(context: ExtensionContext) {
	// const cwd = workspace.rootPath;
	

	const disposable = commands.registerCommand('gradle', () => {
		return window.showQuickPick(list()).then(task => {
			proc.exec(
				cmd() + " " + task.label, 
				{cwd: workspace.rootPath}, 
				(err, stdout, stderr) => {
					if (err) window.showErrorMessage("An error occured");
					else window.showInformationMessage("Success!");
				})
		})
	});

	context.subscriptions.push(disposable);
}

function cmd(): string { return workspace.getConfiguration().get("gradle.useCommand", "gradlew"); }

function list(): Promise<QuickPickItem[]> {
	const regex = /$\s*([a-z0-9]+)\s-\s(.*)$/mgi;
	
	return new Promise(resolve => {
		if (cacheNeeded) { proc.exec(cmd() + " tasks", {cwd: workspace.rootPath}, (err, stdout, stderr) => {
				if (err) { return resolve([])}
				var match: RegExpExecArray;
				var items: QuickPickItem[] = [];
				
				while ((match = regex.exec(stdout.toString('utf8'))) !== null) {
					items.push({
						label: match[1],
						description: match[2], 
					})
				} 
				
				TaskCache = items;
				// cacheNeeded = false; //Maybe I'll implement this later...
				return resolve(items);
			});
		}
		else return resolve(TaskCache);
	})
}