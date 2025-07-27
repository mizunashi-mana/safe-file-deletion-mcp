# Contributing to Safe File Deletion MCP Server

Thank you for your interest in contributing to the Safe File Deletion MCP Server! This document provides guidelines and information for developers who want to contribute to this project.

## 📋 Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Standards](#code-standards)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## 🛠️ Development Setup

### Prerequisites

- Node.js 20+ 
- npm or yarn
- TypeScript 5.7+
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/mizunashi-mana/safe-file-deletion-mcp.git
cd safe-file-deletion-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests to verify setup
npm test
```

## 📁 Project Structure

```
safe-file-deletion-mcp/
├── src/
│   ├── core/                         # Business logic layer
│   │   ├── ConfigurationManager.ts   # Configuration management
│   │   ├── ProtectionEngine.ts       # Protection rules management
│   │   ├── SafeDeletionService.ts    # Deletion operation execution
│   │   ├── LoggingService.ts         # Log management
│   │   ├── ErrorHandler.ts           # Basic error handling
│   │   ├── ComprehensiveErrorHandler.ts # Comprehensive error management
│   │   ├── MCPServer.ts              # MCP protocol implementation
│   │   └── ServerStartup.ts          # Server startup & CLI management
│   ├── types/                        # Type definitions & schemas
│   │   └── index.ts                  # Centralized type exports
│   └── index.ts                      # Entry point
├── test/
│   ├── core/                         # Unit tests for core modules
│   ├── integration/                  # Integration tests
│   └── setup.test.ts                 # Test environment setup
├── dist/                             # Compiled JavaScript (generated)
├── spec/                             # Specifications and documentation
│   ├── specs/                        # Feature specifications
│   └── steering/                     # Project steering documents
└── CLAUDE.md                         # AI assistant instructions

```

## 🔄 Development Workflow

### Development Commands

```bash
# Start development server (TypeScript direct execution)
npm run dev -- --allowed-directories /tmp/test --protected-patterns ".git"

# Build for production
npm run build

# Run built server (always use node command, no shebang included)
node dist/src/index.js --allowed-directories /tmp/test --protected-patterns ".git"

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code (MUST run before commit)
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Type checking
npx tsc --noEmit
```

### Important Build Notes

- The built JavaScript file (`dist/src/index.js`) does NOT include a shebang
- Always execute with `node` command
- Relative paths are automatically converted to absolute paths
- Package.json information (version, description, etc.) is dynamically loaded at runtime

## 🧪 Testing

### Test Structure

The project includes comprehensive test coverage:

- **Unit Tests** (`test/core/`): Test individual components in isolation
- **Integration Tests** (`test/integration/`): Test full MCP server functionality
- **Real Server Tests**: Test actual protocol communication

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run specific test file
npx vitest test/core/SafeDeletionService.test.ts

# Run tests in watch mode
npx vitest --watch

# Run only integration tests
npx vitest test/integration/
```

### Writing Tests

- Use Vitest for all tests
- Mock external dependencies when appropriate
- Integration tests should use actual server startup
- Aim for >80% code coverage

Example test structure:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SafeDeletionService } from '@/core/SafeDeletionService.js';

describe('SafeDeletionService', () => {
  let service: SafeDeletionService;

  beforeEach(() => {
    // Setup
  });

  it('should delete allowed files', async () => {
    // Test implementation
  });
});
```

## 📏 Code Standards

### TypeScript Configuration

- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Path aliases: `@/` for `src/`
- All imports must use `.js` extension (even in TypeScript files)

### ESLint Rules

- Run `npm run lint` before every commit
- No unused imports
- Consistent code style (enforced by ESLint)
- Proper error handling required

### Coding Conventions

1. **File Naming**: PascalCase for classes, camelCase for utilities
2. **Imports**: Always use `.js` extension for local imports
3. **Error Handling**: Use custom error types from `@/types/index.js`
4. **Logging**: Use LoggingService for all logging
5. **Async/Await**: Prefer async/await over promises
6. **Type Safety**: Avoid `any` type, use proper type definitions

### Commit Message Format

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or auxiliary tool changes

Example:
```
feat(core): add batch deletion support

- Implement atomic batch operations
- Add validation for batch size limits
- Update tests for new functionality
```

## 🚀 Submitting Changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
   ```bash
   npm test
   ```
6. Lint your code
   ```bash
   npm run lint
   ```
7. Commit your changes using conventional commits
8. Push to your fork
9. Create a Pull Request

### PR Requirements

- [ ] All tests pass
- [ ] ESLint passes with no errors
- [ ] Type checking passes
- [ ] Documentation updated if needed
- [ ] Follows code conventions
- [ ] Includes tests for new features

### Review Process

1. Automated checks must pass
2. Code review by maintainers
3. Address feedback
4. Merge when approved

## 📦 Release Process

### Version Management

We use semantic versioning (SemVer):
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

### Release Steps

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. Build and test
   ```bash
   npm run build
   npm test
   ```
5. Publish to npm
   ```bash
   npm publish
   ```

### Pre-release Testing

Before releasing:
1. Test installation from npm
2. Test all documented examples
3. Verify Claude Code integration
4. Check all platform compatibility

## 🐛 Debugging

### Common Issues

1. **Module resolution errors**: Ensure all imports use `.js` extension
2. **Path not found**: Check that paths are absolute (automatically converted)
3. **Permission errors**: Verify directory exists and has proper permissions

### Debug Mode

Run with debug logging:
```bash
npm run dev -- --allowed-directories /tmp --log-level debug
```

## 📚 Additional Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Node.js ESM Guide](https://nodejs.org/api/esm.html)

## 🤝 Getting Help

- Open an issue for bugs
- Start a discussion for features
- Check existing issues before creating new ones

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project (Apache-2.0 OR MPL-2.0).

---

Thank you for contributing to make file operations safer in AI-assisted development!