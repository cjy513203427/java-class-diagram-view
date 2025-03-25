import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(child_process.exec);

export class SVGGenerator {
    private static plantUmlJarPath = path.join(__dirname, '../../lib/plantuml-mit-1.2025.0.jar');

    /**
     * Generate SVG diagram from PlantUML content
     * @param pumlContent PlantUML content as string
     * @param outputDir Directory to save the SVG file
     * @param fileName Name of the file without extension
     * @returns Path to the generated SVG file
     */
    public static async generateSVG(pumlContent: string, outputDir: string, fileName: string): Promise<string> {
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Create temporary PUML file
        const tempDir = path.join(outputDir, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const pumlFilePath = path.join(tempDir, `${fileName}.puml`);
        await fs.promises.writeFile(pumlFilePath, pumlContent);

        // Generate SVG file
        const svgFilePath = path.join(outputDir, `${fileName}.svg`);
        
        try {
            // Execute PlantUML JAR to generate SVG
            await execAsync(
                `java -jar "${this.plantUmlJarPath}" -tsvg "${pumlFilePath}" -o "${outputDir}"`
            );

            // Check if SVG file was created
            if (!fs.existsSync(svgFilePath)) {
                throw new Error(`SVG file was not generated at ${svgFilePath}`);
            }

            // Clean up temporary PUML file
            await fs.promises.unlink(pumlFilePath);
            
            // Try to remove temp directory if empty
            try {
                await fs.promises.rmdir(tempDir);
            } catch (error) {
                // Ignore error if directory is not empty
            }

            return svgFilePath;
        } catch (error) {
            console.error('Error generating SVG:', error);
            throw error;
        }
    }
}