# Java Class Diagram View

A Visual Studio Code extension that generates PlantUML class diagrams from Java source code.

## Features

- Generate class diagrams from Java source files
- Support for class inheritance and interfaces
- Display class members including fields and methods
- Show access modifiers
- Parse system classes (like java.lang.String) using javap
- Export diagrams in PlantUML format

## Requirements

- Java Development Kit (JDK) 8 or later
- Visual Studio Code 1.60.0 or later
- JavaParser Core 3.26.3 (included)

## Usage

1. Open a Java source file in VS Code
2. Right-click in the editor
3. Select "Generate Class Diagram" from the context menu
4. The class diagram will be generated using PlantUML

## Extension Settings

This extension contributes the following settings:

* `java-class-diagram-view.autoUpdate`: Enable/disable automatic diagram updates
* `java-class-diagram-view.includeMethods`: Show/hide methods in the diagram
* `java-class-diagram-view.includeFields`: Show/hide fields in the diagram

## Known Issues

- Currently supports single class files only
- Package-level visualization coming in future updates

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
