import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import * as child_process from 'child_process';

const execAsync = util.promisify(child_process.exec);

// Interface for class information
export interface ClassInfo {
    name: string;
    fields: FieldInfo[];
    methods: MethodInfo[];
    modifiers: string[];
    annotations: string[];
    extends?: string;
    implements?: string[];
}

export interface FieldInfo {
    name: string;
    type: string;
    modifiers: string[];
}

export interface MethodInfo {
    name: string;
    returnType: string;
    parameters: ParameterInfo[];
    modifiers: string[];
}

export interface ParameterInfo {
    name: string;
    type: string;
}

export class JavaCodeParser {
    private static readonly JAR_PATH = path.join(__dirname, '..', '..', 'lib', 'javaparser-core-3.26.3.jar');

    /**
     * Parse Java source code and extract class information
     * @param sourceCode Java source code as string
     * @returns ClassInfo object containing the parsed class information
     */
    public static async parse(sourceCode: string): Promise<ClassInfo> {
        try {
            // Create a temporary file to store the Java code
            const tempDir = path.join(__dirname, '..', '..', 'temp');
            const tempFile = path.join(tempDir, `temp_${Date.now()}.java`);
            
            // Ensure temp directory exists
            await fs.promises.mkdir(tempDir, { recursive: true });
            
            // Write Java code to temp file
            await fs.promises.writeFile(tempFile, sourceCode);

            // Create and compile the parser class
            const parserDir = path.join(tempDir, 'parser');
            await fs.promises.mkdir(parserDir, { recursive: true });
            
            const parserCode = `
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;

public class Parser {
    public static void main(String[] args) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(new java.io.File(args[0]));
            
            // Find the first class declaration
            ClassOrInterfaceDeclaration classDecl = cu.findFirst(ClassOrInterfaceDeclaration.class)
                .orElseThrow(() -> new RuntimeException("No class found"));

            // Build JSON output
            StringBuilder json = new StringBuilder();
            json.append("{\\n");

            // Class name
            json.append("  \\"name\\": \\"").append(classDecl.getNameAsString()).append("\\",\\n");

            // Modifiers
            json.append("  \\"modifiers\\": [");
            json.append(String.join(", ", classDecl.getModifiers().stream()
                .map(mod -> "\\"" + mod.getKeyword().asString() + "\\"")
                .toArray(String[]::new)));
            json.append("],\\n");

            // Annotations
            json.append("  \\"annotations\\": [");
            json.append(String.join(", ", classDecl.getAnnotations().stream()
                .map(anno -> "\\"@" + anno.getNameAsString() + "\\"")
                .toArray(String[]::new)));
            json.append("],\\n");

            // Extends
            if (classDecl.getExtendedTypes().size() > 0) {
                json.append("  \\"extends\\": \\"").append(classDecl.getExtendedTypes().get(0).getNameAsString()).append("\\",\\n");
            }

            // Implements
            json.append("  \\"implements\\": [");
            json.append(String.join(", ", classDecl.getImplementedTypes().stream()
                .map(type -> "\\"" + type.getNameAsString() + "\\"")
                .toArray(String[]::new)));
            json.append("],\\n");

            // Fields
            json.append("  \\"fields\\": [");
            json.append(String.join(", ", classDecl.getFields().stream()
                .map(field -> {
                    StringBuilder fieldJson = new StringBuilder();
                    fieldJson.append("{");
                    fieldJson.append("\\"name\\": \\"").append(field.getVariable(0).getNameAsString()).append("\\",");
                    fieldJson.append("\\"type\\": \\"").append(field.getVariable(0).getTypeAsString()).append("\\",");
                    fieldJson.append("\\"modifiers\\": [")
                        .append(String.join(", ", field.getModifiers().stream()
                            .map(mod -> "\\"" + mod.getKeyword().asString() + "\\"")
                            .toArray(String[]::new)))
                        .append("]");
                    fieldJson.append("}");
                    return fieldJson.toString();
                })
                .toArray(String[]::new)));
            json.append("],\\n");

            // Methods
            json.append("  \\"methods\\": [");
            json.append(String.join(", ", classDecl.getMethods().stream()
                .map(method -> {
                    StringBuilder methodJson = new StringBuilder();
                    methodJson.append("{");
                    methodJson.append("\\"name\\": \\"").append(method.getNameAsString()).append("\\",");
                    methodJson.append("\\"returnType\\": \\"").append(method.getTypeAsString()).append("\\",");
                    methodJson.append("\\"modifiers\\": [")
                        .append(String.join(", ", method.getModifiers().stream()
                            .map(mod -> "\\"" + mod.getKeyword().asString() + "\\"")
                            .toArray(String[]::new)))
                        .append("],");
                    methodJson.append("\\"parameters\\": [")
                        .append(String.join(", ", method.getParameters().stream()
                            .map(param -> "{\\"name\\": \\"" + param.getNameAsString() + 
                                        "\\", \\"type\\": \\"" + param.getTypeAsString() + "\\"}")
                            .toArray(String[]::new)))
                        .append("]");
                    methodJson.append("}");
                    return methodJson.toString();
                })
                .toArray(String[]::new)));
            json.append("]\\n");

            json.append("}");
            System.out.println(json);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }
}`;

            const parserFile = path.join(parserDir, 'Parser.java');
            await fs.promises.writeFile(parserFile, parserCode);

            // Compile the parser
            console.log('Compiling parser...');
            await execAsync(`javac -cp "${this.JAR_PATH}" "${parserFile}"`);

            // Run the parser
            console.log('Running parser...');
            const { stdout, stderr } = await execAsync(
                `java -cp "${this.JAR_PATH}${path.delimiter}${parserDir}" Parser "${tempFile}"`,
                { maxBuffer: 1024 * 1024 } // 1MB buffer
            );

            if (stderr) {
                console.error('Parser stderr:', stderr);
            }

            // Clean up temp files
            await fs.promises.rm(tempDir, { recursive: true, force: true });

            // Parse the JSON output
            const result = JSON.parse(stdout) as ClassInfo;
            console.log('Parsing completed successfully');
            return result;

        } catch (error) {
            console.error('Error parsing Java code:', error);
            throw error;
        }
    }
} 