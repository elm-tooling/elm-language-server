'use strict';
import * as cp from 'child_process';
import Uri from 'vscode-uri/lib/umd'
const Compiler = require('node-elm-compiler');
import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	Range,
	Position,
	TextEdit
} from 'vscode-languageserver';
import { runLinter, IElmIssue } from './elmLinter';
// import { ElmAnalyse } from './elmAnalyse';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let rootPath: string = undefined;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;
	this.rootPath = params.rootPath;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		capabilities.workspace && !!capabilities.workspace.configuration;
	hasWorkspaceFolderCapability =
		capabilities.workspace && !!capabilities.workspace.workspaceFolders;

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true
			}
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});


documents.onDidOpen(params => {
	const elmAnalyseIssues: IElmIssue[] = [];
	// const elmAnalyse = new ElmAnalyse(elmAnalyseIssues);
	runLinter(connection, this.rootPath, params.document);
	// validateTextDocument(params.document);
});

documents.onDidSave(params => {
	// const elmAnalyseIssues: IElmIssue[] = [];
	// const elmAnalyse = new ElmAnalyse(elmAnalyseIssues);
	runLinter(connection, this.rootPath, params.document);

	// validateTextDocument(params.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	connection.console.log('Validate text');
	let uri = Uri.parse(textDocument.uri);

	let diagnostics: Diagnostic[] = []
	try {
		await Compiler.compileToString(uri.fsPath, { report: 'json' })

		var x = await Compiler.findAllDependencies(uri.fsPath);
			connection.console.log(x);
			
	} catch (err) {
		const issues = JSON.parse(err.message.split('\n')[1]);
		const byFile = issues.reduce((acc: any, issue: any) => {
			if (acc[issue.file]) {
				acc[issue.file].push(issue);
			} else {
				acc[issue.file] = [issue];
			}
	
			return acc;
		}, {});
	
		Object.keys(byFile).forEach((file: string) => {
			byFile[file].map((issue: any) => {
				diagnostics.push( {
					severity: DiagnosticSeverity.Error,
					source: "Elm",
					message: issue.details,
					range: {
						start: {
							line: issue.region.start.line - 1,
							character: issue.region.start.column - 1,
						},
						end: {
							line: issue.region.end.line - 1,
							character: issue.region.end.column - 1,
						},
					},
				});
			});
	
		});
	}
	finally {
		connection.sendDiagnostics({
			uri: textDocument.uri,
			diagnostics: diagnostics,
		});
	}

};

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}
);

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			(item.detail = 'TypeScript details'),
				(item.documentation = 'TypeScript documentation');
		} else if (item.data === 2) {
			(item.detail = 'JavaScript details'),
				(item.documentation = 'JavaScript documentation');
		}
		return item;
	}
);

connection.onDocumentFormatting(params => {
	const document = documents.get(params.textDocument.uri);
	const text = document.getText();

	const wholeDocument = Range.create(
		Position.create(0, 0),
		document.positionAt(text.length - 1),
	);

	return new Promise<string>((resolve, reject) => {
		const cmd = cp.exec('elm-format --stdin', (err, stdout) => {
			err ? reject(err) : resolve(stdout);
		});

		cmd.stdin.write(text);
		cmd.stdin.end();
	})
		.then(formattedText => {
			return [TextEdit.replace(wholeDocument, formattedText)];
		})
		.catch(_err => {
			// if ((<string>err.message).indexOf('SYNTAX PROBLEM') >= 0) {
			//   return new LServer.ResponseError(
			//     LServer.ErrorCodes.ParseError,
			//     'Running elm-format failed. Check the file for syntax errors.',
			//   );
			// } else {
			//   return new LServer.ResponseError(
			//     LServer.ErrorCodes.InternalError,
			//     'Running elm-format failed. Install from ' +
			//       "https://github.com/avh4/elm-format and make sure it's on your path",
			//   );
			// }
			return [];
		});
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
