# Safe File Deletion MCP Server

[![npm version](https://badge.fury.io/js/%40mizunashi_mana%2Fsafe-file-deletion-mcp.svg)](https://badge.fury.io/js/%40mizunashi_mana%2Fsafe-file-deletion-mcp)
[![Test Status](https://github.com/mizunashi-mana/safe-file-deletion-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/mizunashi-mana/safe-file-deletion-mcp/actions/workflows/test.yml)

A Model Context Protocol (MCP) server that provides safe file and directory deletion with comprehensive protection mechanisms. This server ensures that critical files and directories are protected from accidental deletion while allowing safe cleanup operations within designated directories.

## 🌟 Features

- **🛡️ Safe Deletion Operations**: Only allows file deletion within explicitly permitted directories
- **🔒 Protection Patterns**: Prevents deletion of critical files using glob patterns
- **📦 Batch Deletion**: Supports multiple file deletion with atomic operations
- **✅ Real-time Validation**: Strict path validation before any deletion
- **📝 Comprehensive Logging**: Detailed operation logs with automatic rotation
- **🔌 MCP Protocol**: Standard MCP interface for seamless AI tool integration

## ⚡ Quick Start

### Using with npx (Recommended)

No installation required - run directly with npx:

```bash
# Run with basic protection
npx @mizunashi_mana/safe-file-deletion-mcp \
  --allowed-directories /tmp/safe-area \
  --protected-patterns ".git,node_modules"

# Run with configuration file
npx @mizunashi_mana/safe-file-deletion-mcp \
  --config ./mcp-config.json
```

### Global Installation (Optional)

For frequent use, you can install globally:

```bash
npm install -g @mizunashi_mana/safe-file-deletion-mcp

# Then run without npx
safe-file-deletion-mcp --allowed-directories /tmp/safe-area
```

## ⚙️ Configuration

### Command Line Options

| Option | Description | Required | Example |
|--------|-------------|----------|---------|
| `--allowed-directories` | Comma-separated list of allowed directories | Yes* | `/tmp,/home/user/projects` |
| `--protected-patterns` | Comma-separated glob patterns to protect | No | `.git,node_modules,*.env` |
| `--config` | Path to JSON configuration file | No** | `./config.json` |
| `--log-level` | Logging level | No | `debug`, `info`, `warn`, `error` |
| `--help` | Show help message | No | - |
| `--version` | Show version information | No | - |

\* Required unless using `--config`
\** If provided, overrides the need for `--allowed-directories`

### Configuration File

Create a JSON configuration file for complex setups:

```json
{
  "allowedDirectories": [
    "/tmp/safe-area",
    "/home/user/cleanup"
  ],
  "protectedPatterns": [
    ".git",
    "node_modules",
    "*.env",
    "**/*.key",
    "config/secrets.*"
  ],
  "logLevel": "info"
}
```

Use with npx:

```bash
npx @mizunashi_mana/safe-file-deletion-mcp --config ./mcp-config.json
```

## 🔗 Claude Code Integration

Add to your Claude Code MCP settings:

### Option 1: Using npx (No Installation)

```json
{
  "mcpServers": {
    "safe-file-deletion": {
      "command": "npx",
      "args": [
        "@mizunashi_mana/safe-file-deletion-mcp",
        "--allowed-directories", "/home/user/projects",
        "--protected-patterns", ".git,node_modules,src,*.env"
      ]
    }
  }
}
```

### Option 2: Using Configuration File

```json
{
  "mcpServers": {
    "safe-file-deletion": {
      "command": "npx",
      "args": [
        "@mizunashi_mana/safe-file-deletion-mcp",
        "--config", "/home/user/.config/mcp/safe-deletion.json"
      ]
    }
  }
}
```

### Option 3: With Global Installation

```json
{
  "mcpServers": {
    "safe-file-deletion": {
      "command": "safe-file-deletion-mcp",
      "args": [
        "--allowed-directories", "/home/user/projects",
        "--protected-patterns", ".git,node_modules,src,*.env"
      ]
    }
  }
}
```

## 🛠️ Available MCP Tools

Once connected, the following tools are available to Claude:

### 1. `delete`
Safely delete files and directories.

**Parameters:**
- `paths` (string[]): Array of absolute paths to delete

**Example:**
```
Can you delete the build and dist directories from my project?
```

### 2. `list_protected`
List all currently protected patterns.

**Returns:** Array of protected glob patterns

**Example:**
```
What files are protected from deletion?
```

### 3. `get_allowed`
Get list of allowed directories.

**Returns:** Array of allowed directory paths

**Example:**
```
Which directories am I allowed to delete files from?
```

## 💡 Usage Examples

### Example 1: Clean Temporary Files

```bash
npx @mizunashi_mana/safe-file-deletion-mcp \
  --allowed-directories "/tmp,/var/tmp" \
  --protected-patterns "*.pid,*.lock"
```

Then ask Claude:
> "Delete all .log and .tmp files from the temp directories"

### Example 2: Project Cleanup

```bash
npx @mizunashi_mana/safe-file-deletion-mcp \
  --allowed-directories "./my-project" \
  --protected-patterns ".git,src,package.json,*.env"
```

Then ask Claude:
> "Clean up build artifacts and generated files from my project"

### Example 3: Safe Home Directory Cleanup

Create `~/.config/mcp/safe-deletion.json`:

```json
{
  "allowedDirectories": [
    "~/Downloads",
    "~/Desktop",
    "~/tmp"
  ],
  "protectedPatterns": [
    ".*",
    "*.key",
    "*.pem",
    "*.env"
  ]
}
```

Run with:
```bash
npx @mizunashi_mana/safe-file-deletion-mcp \
  --config ~/.config/mcp/safe-deletion.json
```

## 🔒 Security Features

### Path Safety
- **Absolute Path Requirement**: All paths must be absolute
- **Directory Validation**: Only operates within explicitly allowed directories
- **Automatic Path Resolution**: Relative paths are converted to absolute paths
- **No Symlink Following**: Prevents traversal attacks

### Protection Mechanisms
- **Glob Pattern Matching**: Flexible pattern-based protection
- **Default Protections**: `.git` directories protected by default
- **Atomic Operations**: Batch deletions are all-or-nothing
- **Pre-deletion Validation**: Every file checked before any deletion

### Logging & Audit
- **Detailed Operation Logs**: Every deletion attempt is logged
- **Automatic Log Rotation**: Prevents disk space exhaustion
- **Error Tracking**: Failed operations logged with reasons

## ❓ FAQ

### Why do I need to specify allowed directories?

This is a safety feature to prevent accidental deletion of important system files or directories outside your intended work area.

### Can I use relative paths?

Yes, relative paths in `--allowed-directories` are automatically converted to absolute paths. For example, `.` becomes the current working directory's absolute path.

### What happens if I try to delete a protected file?

The operation will fail with a clear error message indicating which pattern protected the file. No files will be deleted in a batch operation if any are protected.

### How do glob patterns work?

- `*.env` - Matches any file ending with .env
- `**/*.key` - Matches .key files in any subdirectory
- `.git` - Matches directories or files named .git
- `config/*` - Matches anything directly inside config directory

### Can I delete empty directories?

Yes, empty directories within allowed paths can be deleted unless protected by patterns.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for development setup and guidelines.

## 📄 License

This project is licensed under Apache-2.0 OR MPL-2.0 dual license. You may choose either license that best suits your needs.

## 🐛 Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/mizunashi-mana/safe-file-deletion-mcp/issues).

## 🙏 Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) for safer file operations in AI-assisted development.

---

**Made with ❤️ for safer AI-assisted file management**
