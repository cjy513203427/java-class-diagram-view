import * as fs from 'fs';
import * as path from 'path';

export class FileScanner {
    /**
     * Recursively scan directory for Java files
     * @param dir Directory to scan
     * @returns Array of Java file paths
     */
    public static scanJavaFiles(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                // Recursively scan subdirectories
                results = results.concat(this.scanJavaFiles(filePath));
            } else if (path.extname(file) === '.java') {
                // Add Java files to results
                results.push(filePath);
            }
        });
        
        return results;
    }
} 