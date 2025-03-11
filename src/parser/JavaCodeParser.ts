import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import * as child_process from 'child_process';
import * as os from 'os';

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
    packageName?: string;
    filePath?: string;
    parentClass?: ClassInfo;
}

export interface FieldInfo {
    name: string;
    type: string;
    modifiers: string[];
    annotations: string[];
}

export interface MethodInfo {
    name: string;
    returnType: string;
    parameters: ParameterInfo[];
    modifiers: string[];
    annotations: string[];
}

export interface ParameterInfo {
    name: string;
    type: string;
}

export class JavaCodeParser {
    private static tempDir = path.join(os.tmpdir(), 'java-class-diagram');
    private static jarPath = path.join(__dirname, '../../lib/javaparser-core-3.26.3.jar');

    /**
     * Parse Java source code and get class information including parent classes
     */
    public static async parse(javaCode: string, filePath?: string): Promise<ClassInfo> {
        const classInfo = await this.parseClass(javaCode);
        if (filePath) {
            classInfo.filePath = filePath;
        }

        // If class extends another class, parse parent class
        if (classInfo.extends) {
            try {
                const parentClassCode = await this.findProjectClass(classInfo.extends, classInfo.packageName, filePath);
                if (parentClassCode) {
                    const parentClassInfo = await this.parse(parentClassCode, path.join(path.dirname(filePath || ''), `${classInfo.extends}.java`));
                    if (parentClassInfo) {
                        classInfo.parentClass = parentClassInfo;
                    }
                } else {
                    // If not found in project, try system class
                    let fullClassName = classInfo.packageName ? `${classInfo.packageName}.${classInfo.extends}` : classInfo.extends;
                    
                    // Handle system classes
                    if (!fullClassName.includes('.')) {
                        // No longer add java.lang prefix by default, handle through general logic below
                    }
                    
                    // List of common Java packages to try
                    const commonPackages = [
                        '', // Try as is first
                        'java.lang.',
                        'java.util.',
                        'java.io.',
                        'java.applet.',
                        'javax.swing.',
                        'java.awt.',
                        'java.net.',
                        'java.sql.',
                        'javax.servlet.',
                        'java.math.',
                        'java.security.',
                        'java.text.',
                        'java.time.'
                    ];
                    
                    try {
                        // Parse system class
                        let found = false;
                        let error = null;
                        
                        // Special case for Applet (common case)
                        if (classInfo.extends === 'Applet') {
                            try {
                                const { stdout } = await execAsync(`javap -c java.applet.Applet`);
                                classInfo.parentClass = this.parseJavapOutput(stdout, 'java.applet.Applet');
                                // Update the extends field to full name
                                classInfo.extends = 'java.applet.Applet';
                                found = true;
                            } catch (e) {
                                error = e;
                            }
                        }
                        
                        // If class name already includes a package, try it directly
                        if (fullClassName.includes('.')) {
                            try {
                                const { stdout } = await execAsync(`javap -c ${fullClassName}`);
                                classInfo.parentClass = this.parseJavapOutput(stdout, fullClassName);
                                found = true;
                            } catch (e) {
                                error = e;
                            }
                        }
                        
                        // If not found, try with common packages
                        if (!found) {
                            // Get simple class name (without package)
                            const simpleClassName = classInfo.extends && classInfo.extends.includes('.') 
                                ? classInfo.extends.split('.').pop() || classInfo.extends
                                : classInfo.extends || '';
                                
                            for (const pkg of commonPackages) {
                                try {
                                    // Skip if class name already includes package and current prefix is empty
                                    if (classInfo.extends && classInfo.extends.includes('.') && pkg === '') {
                                        continue;
                                    }
                                    
                                    // Build class name to try
                                    let classNameToTry: string;
                                    if (pkg) {
                                        classNameToTry = pkg + simpleClassName;
                                    } else {
                                        classNameToTry = classInfo.extends || '';
                                    }
                                    
                                    console.log(`Trying to find class: ${classNameToTry}`);
                                    const { stdout } = await execAsync(`javap -c ${classNameToTry}`);
                                    classInfo.parentClass = this.parseJavapOutput(stdout, classNameToTry);
                                    
                                    // Update extends field with full class name
                                    classInfo.extends = classNameToTry;
                                    
                                    found = true;
                                    break;
                                } catch (e) {
                                    error = e;
                                }
                            }
                        }
                        
                        if (!found) {
                            throw error || new Error(`Could not find class ${fullClassName}`);
                        }

                        // Recursively parse parent class
                        if (classInfo.parentClass && classInfo.parentClass.extends) {
                            let parentClassName = classInfo.parentClass.extends;
                            let currentClass = classInfo.parentClass;
                            
                            // Keep parsing parent classes until we reach Object
                            while (parentClassName && parentClassName !== 'java.lang.Object') {
                                try {
                                    const { stdout } = await execAsync(`javap -c ${parentClassName}`);
                                    const parentClass = this.parseJavapOutput(stdout, parentClassName);
                                    currentClass.parentClass = parentClass;
                                    
                                    // Move to the next parent class
                                    parentClassName = parentClass.extends || '';
                                    currentClass = parentClass;
                                } catch (error) {
                                    console.error(`Error parsing parent class ${parentClassName}: ${error}`);
                                    break;
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Error parsing system class: ${error}`);
                    }
                }
            } catch (error) {
                console.error(`Error parsing parent class: ${error}`);
            }
        }

        return classInfo;
    }

    /**
     * Find a class file in the project
     */
    private static async findProjectClass(className: string, packageName?: string, currentFilePath?: string): Promise<string | undefined> {
        if (!currentFilePath) {
            return undefined;
        }

        // Get the directory of the current file
        const currentDir = path.dirname(currentFilePath);
        
        try {
            // Try to read the parent class file from the same directory
            const parentFilePath = path.join(currentDir, `${className}.java`);
            if (fs.existsSync(parentFilePath)) {
                return fs.readFileSync(parentFilePath, 'utf-8');
            }
        } catch (error) {
            console.error(`Error reading parent class file: ${error}`);
        }
        
        return undefined;
    }

    /**
     * Parse javap output into ClassInfo
     */
    private static parseJavapOutput(output: string, fullClassName: string): ClassInfo {
        // Check if it's a system class
        const isSystemClass = fullClassName.startsWith('java.') || fullClassName.startsWith('javax.');
        
        const lines = output.split('\n');
        const classInfo: ClassInfo = {
            name: fullClassName.split('.').pop() || '',
            fields: [],
            methods: [],
            modifiers: [],
            annotations: [],
            packageName: fullClassName.substring(0, fullClassName.lastIndexOf('.'))
        };

        let currentMethod: MethodInfo | null = null;
        let inCodeBlock = false;

        // Parse javap output lines
        lines.forEach(line => {
            line = line.trim();
            
            // Skip empty lines and code blocks
            if (!line || line === 'Code:') {
                inCodeBlock = line === 'Code:';
                return;
            }
            
            // Skip bytecode lines
            if (inCodeBlock && (line.match(/^\d+:/) || line.startsWith('/'))) {
                return;
            }

            // Class declaration line
            if (line.includes('class')) {
                // Match: public class java.lang.Exception extends java.lang.Throwable {
                const classMatch = line.match(/(?:public |abstract |final )*class\s+([\w.$]+)\s+extends\s+([\w.$]+)/);
                if (classMatch) {
                    classInfo.modifiers = line.split('class')[0].trim().split(' ').filter(Boolean);
                    classInfo.extends = classMatch[2]; // Full class name including package
                }
                return;
            }

            // Skip if system class, only parse class name and inheritance
            if (isSystemClass) {
                return;
            }

            // Method or field declaration
            if (line.startsWith('public') || line.startsWith('protected') || line.startsWith('private') || line.startsWith('static')) {
                if (line.includes('(')) {
                    // Method
                    const method = this.parseJavapMethod(line);
                    if (method.name) {
                        classInfo.methods.push(method);
                        currentMethod = method;
                    }
                } else {
                    // Field
                    const field = this.parseJavapField(line);
                    if (field.name) {
                        classInfo.fields.push(field);
                    }
                }
            }
        });

        return classInfo;
    }

    private static parseJavapMethod(line: string): MethodInfo {
        try {
            // Extract method signature more reliably
            // Example: public java.lang.Exception(java.lang.String);
            // Example: public void printStackTrace(java.io.PrintStream);
            
            // Check if it's a constructor
            const isConstructor = line.includes(`${this.extractClassName(line)}(`);
            
            // Get method modifiers
            const modifiers = line.split('(')[0].trim().split(' ');
            modifiers.pop(); // Remove method name/return type
            
            // For constructors, the name is the same as class name
            if (isConstructor) {
                const classNameWithPackage = modifiers.pop() || '';
                const className = classNameWithPackage.split('.').pop() || '';
                
                // Get parameters
                const paramString = line.split('(')[1].split(')')[0];
                const parameters = this.parseParameters(paramString);
                
                return {
                    name: className,
                    returnType: '',
                    parameters,
                    modifiers,
                    annotations: []
                };
            } else {
                // For regular methods
                const returnType = modifiers.pop() || '';
                const methodName = line.split(returnType)[1].trim().split('(')[0].trim();
                
                // Get parameters
                const paramString = line.split('(')[1].split(')')[0];
                const parameters = this.parseParameters(paramString);
                
                return {
                    name: methodName,
                    returnType,
                    parameters,
                    modifiers,
                    annotations: []
                };
            }
        } catch (error) {
            console.error('Error parsing method:', line, error);
            return {
                name: '',
                returnType: '',
                parameters: [],
                modifiers: [],
                annotations: []
            };
        }
    }

    private static extractClassName(line: string): string {
        // Extract class name from line like "public java.lang.Exception()"
        const parts = line.split(' ');
        for (const part of parts) {
            if (part.includes('.')) {
                return part.split('.').pop() || '';
            }
        }
        return '';
    }

    private static parseParameters(paramString: string): ParameterInfo[] {
        if (!paramString.trim()) {
            return [];
        }
        
        return paramString.split(',').map(param => {
            const type = param.trim();
            return {
                type,
                name: '' // javap doesn't show param names
            };
        });
    }

    private static parseJavapField(line: string): FieldInfo {
        const fieldMatch = line.match(/(?:public |protected |private |static |final |volatile |transient )*(?:[\w.<>]+)\s+([\w<>]+)\s+([\w]+)/);
        if (fieldMatch) {
            return {
                name: fieldMatch[2],
                type: fieldMatch[1],
                modifiers: line.split(fieldMatch[1])[0].trim().split(' ').filter(Boolean),
                annotations: []
            };
        }
        return {
            name: '',
            type: '',
            modifiers: [],
            annotations: []
        };
    }

    /**
     * Parse Java source code and extract class information
     * @param sourceCode Java source code as string
     * @returns ClassInfo object containing the parsed class information
     */
    public static async parseClass(sourceCode: string): Promise<ClassInfo> {
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
            await execAsync(`javac -cp "${this.jarPath}" "${parserFile}"`);

            // Run the parser
            console.log('Running parser...');
            const { stdout, stderr } = await execAsync(
                `java -cp "${this.jarPath}${path.delimiter}${parserDir}" Parser "${tempFile}"`,
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

    /**
     * Recursively parse system classes and their parents
     */
    private static async parseSystemClassWithParents(fullClassName: string, classInfo: ClassInfo, depth: number = 0): Promise<void> {
        if (depth > 10) { // Prevent infinite recursion (limit depth)
            return;
        }

        try {
            const { stdout } = await execAsync(`javap -c ${fullClassName}`);
            const parsedClass = this.parseJavapOutput(stdout, fullClassName);
            
            // Set as parent class
            classInfo.parentClass = parsedClass;
            
            // Recursively parse parent of system class
            if (parsedClass.extends && parsedClass.extends !== 'java.lang.Object') {
                await this.parseSystemClassWithParents(parsedClass.extends, parsedClass, depth + 1);
            }
        } catch (error) {
            console.error(`Error parsing system class ${fullClassName}: ${error}`);
        }
    }
} 