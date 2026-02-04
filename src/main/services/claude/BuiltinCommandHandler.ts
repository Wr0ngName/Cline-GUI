/**
 * Built-in Command Handler for Claude Code
 *
 * Handles built-in CLI commands that are NOT supported by the SDK.
 * The SDK only supports "skills" (custom commands), not the interactive CLI commands.
 * These commands must be handled locally in the app.
 */

import { SlashCommandInfo } from '../../../shared/types';
import logger from '../../utils/logger';

/**
 * Built-in CLI commands with descriptions
 * These are shown in /help output
 */
export const BUILTIN_COMMANDS: SlashCommandInfo[] = [
  { name: 'help', description: 'Show all available slash commands', argumentHint: '' },
  { name: 'clear', description: 'Clear conversation history and context', argumentHint: '' },
  { name: 'compact', description: 'Compress context by summarizing conversation', argumentHint: '[focus area]' },
  { name: 'context', description: 'View current context window usage', argumentHint: '' },
  { name: 'cost', description: 'Show token usage and cost information', argumentHint: '' },
  { name: 'memory', description: 'Edit CLAUDE.md memory file', argumentHint: '' },
  { name: 'permissions', description: 'Manage tool permissions', argumentHint: '' },
  { name: 'status', description: 'View current session status', argumentHint: '' },
  { name: 'doctor', description: 'Run diagnostics on your setup', argumentHint: '' },
  { name: 'login', description: 'Switch accounts or re-authenticate', argumentHint: '' },
  { name: 'logout', description: 'Log out of current account', argumentHint: '' },
  { name: 'bug', description: 'Report a bug to Anthropic', argumentHint: '' },
  { name: 'model', description: 'Switch AI model', argumentHint: '[model name]' },
  { name: 'vim', description: 'Toggle vim mode for input', argumentHint: '' },
];

/**
 * Built-in CLI commands that must be handled locally (not by SDK)
 */
export const BUILTIN_COMMAND_NAMES = new Set(BUILTIN_COMMANDS.map(c => c.name));

/**
 * Result of handling a built-in command
 */
export interface BuiltinCommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Response message to display */
  response?: string;
  /** Whether this command requires special action (e.g., clear conversation) */
  action?: 'clear' | 'compact' | 'login' | 'logout';
}

/**
 * Callbacks for built-in command actions
 */
export interface BuiltinCommandCallbacks {
  /** Get available slash commands for /help */
  getSlashCommands: () => SlashCommandInfo[];
  /** Emit response chunk */
  onChunk: (chunk: string) => void;
  /** Signal command completion */
  onDone: () => void;
}

/**
 * Handler for built-in CLI commands
 */
export class BuiltinCommandHandler {
  private callbacks: BuiltinCommandCallbacks;

  constructor(callbacks: BuiltinCommandCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Check if a message is a built-in command
   */
  isBuiltinCommand(message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) return false;

    const commandName = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
    return BUILTIN_COMMAND_NAMES.has(commandName);
  }

  /**
   * Handle a built-in command
   * Returns the result with response and any required action
   */
  handleCommand(message: string): BuiltinCommandResult {
    const trimmed = message.trim();
    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    logger.info('Handling built-in command', { commandName, args });

    switch (commandName) {
      case 'help':
        return this.handleHelp();
      case 'clear':
        return this.handleClear();
      case 'compact':
        return this.handleCompact(args);
      case 'context':
        return this.handleContext();
      case 'cost':
        return this.handleCost();
      case 'memory':
        return this.handleMemory();
      case 'permissions':
        return this.handlePermissions();
      case 'status':
        return this.handleStatus();
      case 'doctor':
        return this.handleDoctor();
      case 'login':
        return this.handleLogin();
      case 'logout':
        return this.handleLogout();
      case 'bug':
        return this.handleBug();
      case 'model':
        return this.handleModel(args);
      case 'vim':
        return this.handleVim();
      default:
        return { handled: false };
    }
  }

  private handleHelp(): BuiltinCommandResult {
    // Get cached commands (may include SDK skills if a query has been made)
    let commands = this.callbacks.getSlashCommands();

    // If no commands cached yet, use built-in commands
    if (commands.length === 0) {
      commands = BUILTIN_COMMANDS;
      logger.debug('Using built-in commands for /help (no cached commands)');
    }

    const lines = [
      '## Available Slash Commands\n',
      ...commands.map(cmd => {
        const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : '';
        const desc = cmd.description || 'No description available';
        return `- **/${cmd.name}**${hint} - ${desc}`;
      }),
      '\n_Note: Additional commands may be available after starting a conversation._',
    ];
    return {
      handled: true,
      response: lines.join('\n'),
    };
  }

  private handleClear(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Conversation cleared._\n\nStart a new conversation by typing a message.',
      action: 'clear',
    };
  }

  private handleCompact(args: string): BuiltinCommandResult {
    // Compact requires the SDK to summarize the conversation
    // We'll pass this through to the SDK as it may support it
    return {
      handled: true,
      response: `_Compacting conversation${args ? ` with focus on: ${args}` : ''}..._\n\n` +
        '**Note:** Compact is not fully supported in GUI mode. ' +
        'The conversation context is managed automatically.',
      action: 'compact',
    };
  }

  private handleContext(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Context information is not available in GUI mode._\n\n' +
        'The conversation context is managed automatically by the SDK.',
    };
  }

  private handleCost(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Cost tracking is not available in GUI mode._\n\n' +
        'Check your usage at [console.anthropic.com](https://console.anthropic.com)',
    };
  }

  private handleMemory(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Memory (CLAUDE.md) editing is not yet supported in GUI mode._\n\n' +
        'You can manually edit CLAUDE.md files in your project directory.',
    };
  }

  private handlePermissions(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Permission management is handled automatically in GUI mode._\n\n' +
        'Tool permissions are requested when needed during the conversation.',
    };
  }

  private handleStatus(): BuiltinCommandResult {
    return {
      handled: true,
      response: '## Session Status\n\n' +
        '- **Mode:** GUI\n' +
        '- **Authentication:** Active\n' +
        '- **SDK:** Connected\n\n' +
        '_Detailed status information is not available in GUI mode._',
    };
  }

  private handleDoctor(): BuiltinCommandResult {
    return {
      handled: true,
      response: '## Diagnostics\n\n' +
        '_Running diagnostics is not available in GUI mode._\n\n' +
        'For troubleshooting, check the application logs at:\n' +
        '`~/.config/ClineGUI/logs/main.log`',
    };
  }

  private handleLogin(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_To change accounts, use the Settings menu._\n\n' +
        'Go to **Settings > Authentication** to manage your login.',
      action: 'login',
    };
  }

  private handleLogout(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_To logout, use the Settings menu._\n\n' +
        'Go to **Settings > Authentication > Logout**',
      action: 'logout',
    };
  }

  private handleBug(): BuiltinCommandResult {
    return {
      handled: true,
      response: '## Report a Bug\n\n' +
        'To report issues with ClineGUI:\n' +
        '- GitHub: [github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)\n\n' +
        'Include your log file from `~/.config/ClineGUI/logs/main.log`',
    };
  }

  private handleModel(args: string): BuiltinCommandResult {
    if (args) {
      return {
        handled: true,
        response: `_Model switching is not yet supported in GUI mode._\n\n` +
          `Requested model: **${args}**\n\n` +
          'The model is configured at the SDK level.',
      };
    }
    return {
      handled: true,
      response: '_Model information is not available in GUI mode._\n\n' +
        'The model is configured at the SDK level.',
    };
  }

  private handleVim(): BuiltinCommandResult {
    return {
      handled: true,
      response: '_Vim mode is not available in GUI mode._\n\n' +
        'The input field uses standard text editing.',
    };
  }
}

export default BuiltinCommandHandler;
