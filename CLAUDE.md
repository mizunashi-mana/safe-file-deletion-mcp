# Project Specification

## Project Overview

**Safe File Deletion MCP Server** - A server that provides safe file deletion functionality through the Model Context Protocol (MCP). Enables secure file operations while protecting important files through integration with AI development tools (such as Claude Code).

## Development Commands

### Basic Operations
- `npm run dev` - Start development server (direct TypeScript execution)
- `npm run build` - Production build
- `npm start` - Start built server
- `npm test` - Run tests
- `npm run lint` - Run ESLint (Required: execute before commit)
- `npm run lint:fix` - ESLint auto-fix

### Post-Build Verification

**Important**: Built JavaScript files must be executed with the `node` command. Direct execution is not possible as a shebang is not included in built files (only in source TypeScript files).

```bash
# Execute build
npm run build

# Display help (dynamically retrieves information from package.json)
node dist/src/index.js --help

# Display version (dynamically retrieves information from package.json)
node dist/src/index.js --version

# Actual server startup (relative paths are automatically converted to absolute paths)
node dist/src/index.js --allowed-directories /tmp/test-dir --protected-patterns ".git,node_modules"

# Specify current directory as allowed directory (. is converted to absolute path)
node dist/src/index.js --allowed-directories . --protected-patterns ".git,node_modules"
```

### Actual Server Startup Examples
```bash
# Development mode (direct TypeScript execution with shebang support)
npx tsx src/index.ts --allowed-directories /tmp/test-dir --protected-patterns ".git,node_modules" --log-level debug

# Alternative development mode
npm run dev -- --allowed-directories /tmp/test-dir --protected-patterns ".git,node_modules" --log-level debug

# Production mode (built JS execution)
npm start -- --allowed-directories /path/to/project --protected-patterns ".git,*.env"

# Or execute directly with node
node dist/src/index.js --allowed-directories /path/to/project --protected-patterns ".git,*.env"
```

## Active Specifications

### safe-file-deletion-mcp
- **Description**: Safe file deletion system operating as an MCP server
- **Status**: **Implementation Complete & Verified**
- **Path**: `spec/specs/safe-file-deletion-mcp/`
- **Key Features**:
  - ✅ Safe file & directory deletion (within allowed scope only)
  - ✅ Important file protection via glob patterns
  - ✅ Batch deletion (atomic operations)
  - ✅ Comprehensive logging & automatic rotation
  - ✅ Full MCP protocol compliance
  - ✅ Multi-layer error handling
  - ✅ CLI argument parsing & configuration file support
  - ✅ Integration tests (actual server startup tests)

## Technical Architecture

### Core Modules (`src/core/`)
- **ServerStartup**: CLI argument parsing, configuration validation, graceful shutdown
- **MCPServer**: MCP protocol implementation, tool registration & request handling
- **SafeDeletionService**: File deletion operation verification & execution
- **ProtectionEngine**: Glob pattern matching & protection rule application
- **ConfigurationManager**: Unified configuration management (CLI args, config files, defaults)
- **LoggingService**: Audit logs, error logs & automatic rotation
- **ErrorHandler**: Basic error handling & custom error classes
- **ComprehensiveErrorHandler**: Comprehensive error management & filesystem error integration

### Available Tools
1. **`delete`**: Safe deletion of files & directories
2. **`list_protected`**: List protection patterns
3. **`get_allowed`**: Get allowed directories

### Testing Strategy
- **Unit Tests**: Individual tests for each core module
- **Integration Tests**: Actual MCP server startup & protocol communication tests
- **End-to-End Tests**: Actual file operation verification with `/tmp/comprehensive-test.js`

## Claude Code Integration Example

```json
{
  "mcpServers": {
    "safe-file-deletion": {
      "command": "npx",
      "args": ["tsx", "src/index.ts", "--allowed-directories", "/path/to/projects", "--protected-patterns", ".git,node_modules,src,*.env"]
    }
  }
}
```

## Package Publication Preparation

- ✅ Comprehensive README.md (English) completed
- ✅ All functionality testing completed
- ✅ ESLint configuration & type checking completed
- ✅ Production build support
- ⏳ Next phase: NPM publication & GitHub Actions setup

## Development Status

- **Implementation Completion**: 100% - All core features implemented & operationally verified
- **Test Coverage**: All 17 integration tests verified with actual server startup
- **Code Quality**: 0 ESLint errors, TypeScript type checking completed
- **Documentation**: English README, Japanese specification, API reference documentation completed
- **Package Publication Readiness**: Complete (package.json, build configuration, entry points verified)

## Technical Notes

### Build Output
- Source TypeScript files (`src/index.ts`) include shebang for `npx tsx` execution
- Built JavaScript files (`dist/src/index.js`) do not include shebang
- Built files must be executed via `node` command
- Relative paths are automatically converted to absolute paths
- package.json information (version, description, etc.) is dynamically loaded

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.