// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { JavaCodeParser, ClassInfo, FieldInfo, MethodInfo, ParameterInfo } from './parser/JavaCodeParser';
import { PlantUMLGenerator } from './plantuml/PlantUMLGenerator';
import { SVGGenerator } from './plantuml/SVGGenerator';
import { FileScanner } from './utils/FileScanner';

// this is a variable for debugging output
let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Java Class Diagram View extension is now active!');

	// create output channel
	outputChannel = vscode.window.createOutputChannel('Java Class Diagram');
	outputChannel.appendLine('Extension activated');
	outputChannel.show();

	let disposable = vscode.commands.registerCommand('java-class-diagram-view.generateClassDiagram', async (uri?: vscode.Uri) => {
		try {
			outputChannel.appendLine('Command triggered');
			
			// Get the file URI
			const fileUri = uri || (vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : undefined);
			
			if (!fileUri) {
				vscode.window.showErrorMessage('No Java file selected!');
				return;
			}

			outputChannel.appendLine(`File path: ${fileUri.fsPath}`);

			// Create output directory
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder found!');
				return;
			}

			const outputDir = path.join(workspaceFolder.uri.fsPath, 'out_classdiagram');

			// Read the file content
			const fileContent = await vscode.workspace.fs.readFile(fileUri);
			const javaCode = Buffer.from(fileContent).toString('utf-8');

			// Parse the Java code
			const classInfo = await JavaCodeParser.parse(javaCode, fileUri.fsPath);

			// Generate PlantUML diagram
			const puml = PlantUMLGenerator.generateClassDiagram(classInfo);
			
			// Save the PUML diagram
			const pumlPath = await PlantUMLGenerator.saveDiagram(
				puml,
				outputDir,
				classInfo.name
			);

			// Generate SVG diagram
			try {
				const svgPath = await SVGGenerator.generateSVG(
					puml,
					outputDir,
					classInfo.name
				);

				// Show success message with both file paths
				vscode.window.showInformationMessage(`Class diagrams generated: PUML: ${pumlPath}, SVG: ${svgPath}`);
			} catch (svgError) {
				// If SVG generation fails, still show the PUML success message
				outputChannel.appendLine(`Error generating SVG: ${svgError instanceof Error ? svgError.message : 'Unknown error'}`);
				vscode.window.showInformationMessage(`PUML diagram generated: ${pumlPath}. SVG generation failed.`);
			}

			// Log detailed information
			outputChannel.appendLine('=== Class Information ===');
			outputChannel.appendLine(`Class Name: ${classInfo.name}`);
			outputChannel.appendLine(`Modifiers: ${classInfo.modifiers.join(', ')}`);
			
			if (classInfo.extends) {
				outputChannel.appendLine(`Extends: ${classInfo.extends}`);
			}
			
			if (classInfo.implements && classInfo.implements.length > 0) {
				outputChannel.appendLine(`Implements: ${classInfo.implements.join(', ')}`);
			}

			outputChannel.appendLine('\n=== Fields ===');
			classInfo.fields.forEach((field: FieldInfo) => {
				outputChannel.appendLine(`${field.modifiers.join(' ')} ${field.type} ${field.name}`);
			});

			outputChannel.appendLine('\n=== Methods ===');
			classInfo.methods.forEach((method: MethodInfo) => {
				const params = method.parameters.map((p: ParameterInfo) => `${p.type} ${p.name}`).join(', ');
				outputChannel.appendLine(`${method.modifiers.join(' ')} ${method.returnType} ${method.name}(${params})`);
			});

			outputChannel.show();

		} catch (error) {
			if (error instanceof Error) {
				const errorMessage = `Error parsing Java file: ${error.message}`;
				vscode.window.showErrorMessage(errorMessage);
				outputChannel.appendLine(errorMessage);
				console.error('Error details:', error);
			} else {
				const errorMessage = 'An unknown error occurred while parsing the Java file';
				vscode.window.showErrorMessage(errorMessage);
				outputChannel.appendLine(errorMessage);
				console.error('Unknown error:', error);
			}
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (outputChannel) {
		outputChannel.dispose();
	}
}
