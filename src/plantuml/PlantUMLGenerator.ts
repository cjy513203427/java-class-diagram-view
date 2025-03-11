import * as fs from 'fs';
import * as path from 'path';
import { ClassInfo, FieldInfo, MethodInfo } from '../parser/JavaCodeParser';

export class PlantUMLGenerator {
    private static processedClasses: Set<string> = new Set();

    /**
     * Generate PlantUML class diagram from class information
     */
    public static generateClassDiagram(classInfo: ClassInfo): string {
        // Reset processed classes for new diagram
        this.processedClasses.clear();
        
        let puml = '@startuml\n\n';
        
        // First generate all class definitions recursively
        puml += this.generateAllClassDefinitionsRecursive(classInfo);
        
        // Then generate all relationships recursively
        puml += this.generateAllRelationshipsRecursive(classInfo);
        
        puml += '\n@enduml';
        return puml;
    }

    /**
     * Save PlantUML diagram to file
     */
    public static async saveDiagram(puml: string, outputDir: string, className: string): Promise<string> {
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const fileName = `${className}.puml`;
        const filePath = path.join(outputDir, fileName);
        
        await fs.promises.writeFile(filePath, puml);
        return filePath;
    }

    private static generateAllClassDefinitionsRecursive(classInfo: ClassInfo): string {
        let result = '';
        
        // Add current class if not processed
        if (!this.processedClasses.has(classInfo.name)) {
            this.processedClasses.add(classInfo.name);
            result += this.generateClassDefinition(classInfo);
        }
        
        // Process parent class recursively
        if (classInfo.parentClass) {
            result += this.generateAllClassDefinitionsRecursive(classInfo.parentClass);
        } else if (classInfo.extends && !this.processedClasses.has(this.getSimpleClassName(classInfo.extends))) {
            // If parent class info not available, add empty class
            const simpleClassName = this.getSimpleClassName(classInfo.extends);
            this.processedClasses.add(simpleClassName);
            
            // For well-known system classes, add stereotype
            if (classInfo.extends.includes('java.applet.Applet') || 
                classInfo.extends.endsWith('.Applet')) {
                result += `class ${simpleClassName} <<system>> {\n}\n\n`;
            } else {
                result += `class ${simpleClassName} {\n}\n\n`;
            }
        }
        
        // Process interfaces
        if (classInfo.implements) {
            classInfo.implements.forEach(interfaceName => {
                if (!this.processedClasses.has(this.getSimpleClassName(interfaceName))) {
                    this.processedClasses.add(this.getSimpleClassName(interfaceName));
                    result += `interface ${this.getSimpleClassName(interfaceName)} {\n}\n\n`;
                }
            });
        }
        
        return result;
    }

    private static generateAllRelationshipsRecursive(classInfo: ClassInfo): string {
        let result = '';

        // Add current class relationships
        if (classInfo.extends) {
            const simpleParentName = this.getSimpleClassName(classInfo.extends);
            
            // Use different arrow style for system classes
            if (classInfo.extends.startsWith('java.') || classInfo.extends.startsWith('javax.')) {
                result += `${simpleParentName} <|.. ${classInfo.name}\n`;
            } else {
                result += `${simpleParentName} <|-- ${classInfo.name}\n`;
            }
        }

        if (classInfo.implements) {
            classInfo.implements.forEach(interfaceName => {
                result += `${this.getSimpleClassName(interfaceName)} <|.. ${classInfo.name}\n`;
            });
        }

        // Process parent class relationships recursively
        if (classInfo.parentClass) {
            result += this.generateAllRelationshipsRecursive(classInfo.parentClass);
        }

        return result;
    }

    private static getSimpleClassName(className: string): string {
        // Extract simple class name from fully qualified name
        return className.includes('.') ? className.split('.').pop()! : className;
    }

    private static generateClassDefinition(classInfo: ClassInfo): string {
        let result = '';
        
        // Check if it's a system class
        const isSystemClass = classInfo.packageName?.startsWith('java.') || classInfo.packageName?.startsWith('javax.');
        
        // Add annotations
        if (!isSystemClass) {
            classInfo.annotations.forEach(annotation => {
                result += `${annotation}\n`;
            });
        }

        // Add class definition
        const classType = classInfo.modifiers.includes('abstract') ? 'abstract class' : 'class';
        result += `${classType} ${classInfo.name}`;
        
        // Add interfaces
        if (!isSystemClass && classInfo.implements && classInfo.implements.length > 0) {
            result += ` implements ${classInfo.implements.join(', ')}`;
        }
        
        result += ' {\n';

        // For system classes, only add a note
        if (isSystemClass) {
            result += '    ..System Class..\n';
        } else {
            // Add fields
            classInfo.fields.forEach(field => {
                result += this.generateField(field);
            });

            // Add methods
            classInfo.methods.forEach(method => {
                result += this.generateMethod(method);
            });
        }

        result += '}\n\n';
        return result;
    }

    private static generateField(field: FieldInfo): string {
        const visibility = this.getVisibilitySymbol(field.modifiers);
        const isStatic = field.modifiers.includes('static') ? '{static} ' : '';
        return `    ${visibility}${isStatic}${field.type} ${field.name}\n`;
    }

    private static generateMethod(method: MethodInfo): string {
        // Skip methods with empty names (parsing errors)
        if (!method.name) {
            return '';
        }
        
        const visibility = this.getVisibilitySymbol(method.modifiers);
        const isStatic = method.modifiers.includes('static') ? '{static} ' : '';
        const params = method.parameters
            .filter(p => p.type) // Filter out empty parameters
            .map(p => `${p.type} ${p.name}`.trim())
            .join(', ');
        return `    ${visibility}${isStatic}${method.returnType} ${method.name}(${params})\n`;
    }

    private static getVisibilitySymbol(modifiers: string[]): string {
        if (modifiers.includes('private')) return '-';
        if (modifiers.includes('protected')) return '#';
        if (modifiers.includes('public')) return '+';
        return '~'; // package private
    }
} 
