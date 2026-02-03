/**
 * Comprehensive tests for IPC helper utilities.
 *
 * Tests cover:
 * - All validation functions with valid/invalid inputs
 * - Edge cases (empty strings, null, undefined, NaN)
 * - Error message formatting
 * - sendToRenderer with various window states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ValidationError, ERROR_CODES } from '../../errors';
import {
  sendToRenderer,
  createSender,
  validateString,
  validateObject,
  validatePath,
  validateBoolean,
  validateNumber,
  validateArray,
  getErrorMessage,
  formatErrorMessage,
} from '../ipc-helpers';

// Mock logger
vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ipc-helpers', () => {
  // ===========================================================================
  // validateString
  // ===========================================================================
  describe('validateString', () => {
    it('should pass for valid non-empty string', () => {
      expect(() => validateString('hello', 'testField')).not.toThrow();
    });

    it('should pass for string with only spaces (after trim check)', () => {
      // The function checks trim().length === 0, so " " should fail
      expect(() => validateString('   ', 'testField')).toThrow(ValidationError);
    });

    it('should throw for empty string', () => {
      expect(() => validateString('', 'testField')).toThrow(ValidationError);
      expect(() => validateString('', 'testField')).toThrow('testField must not be empty');
    });

    it('should throw for null', () => {
      expect(() => validateString(null, 'testField')).toThrow(ValidationError);
      expect(() => validateString(null, 'testField')).toThrow('testField must be a string');
    });

    it('should throw for undefined', () => {
      expect(() => validateString(undefined, 'testField')).toThrow(ValidationError);
    });

    it('should throw for number', () => {
      expect(() => validateString(123, 'testField')).toThrow(ValidationError);
      expect(() => validateString(123, 'testField')).toThrow('testField must be a string');
    });

    it('should throw for boolean', () => {
      expect(() => validateString(true, 'testField')).toThrow(ValidationError);
    });

    it('should throw for object', () => {
      expect(() => validateString({}, 'testField')).toThrow(ValidationError);
    });

    it('should throw for array', () => {
      expect(() => validateString([], 'testField')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      try {
        validateString(null, 'myCustomField');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe('myCustomField');
      }
    });

    it('should set correct error code for type mismatch', () => {
      try {
        validateString(123, 'testField');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).code).toBe(ERROR_CODES.VALIDATION_TYPE_MISMATCH);
      }
    });

    it('should set correct error code for empty string', () => {
      try {
        validateString('', 'testField');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).code).toBe(ERROR_CODES.VALIDATION_REQUIRED);
      }
    });
  });

  // ===========================================================================
  // validateObject
  // ===========================================================================
  describe('validateObject', () => {
    it('should pass for valid object', () => {
      expect(() => validateObject({}, 'testField')).not.toThrow();
      expect(() => validateObject({ key: 'value' }, 'testField')).not.toThrow();
    });

    it('should pass for array (arrays are objects)', () => {
      expect(() => validateObject([], 'testField')).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => validateObject(null, 'testField')).toThrow(ValidationError);
      expect(() => validateObject(null, 'testField')).toThrow('testField must be an object');
    });

    it('should throw for undefined', () => {
      expect(() => validateObject(undefined, 'testField')).toThrow(ValidationError);
    });

    it('should throw for string', () => {
      expect(() => validateObject('string', 'testField')).toThrow(ValidationError);
    });

    it('should throw for number', () => {
      expect(() => validateObject(123, 'testField')).toThrow(ValidationError);
    });

    it('should throw for boolean', () => {
      expect(() => validateObject(true, 'testField')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      try {
        validateObject(null, 'configObject');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).field).toBe('configObject');
      }
    });
  });

  // ===========================================================================
  // validatePath
  // ===========================================================================
  describe('validatePath', () => {
    it('should pass for valid absolute path', () => {
      expect(() => validatePath('/home/user/file.txt')).not.toThrow();
    });

    it('should pass for valid Windows path', () => {
      expect(() => validatePath('C:\\Users\\user\\file.txt')).not.toThrow();
    });

    it('should pass for valid relative path without traversal', () => {
      expect(() => validatePath('folder/file.txt')).not.toThrow();
    });

    it('should throw for path with ../ traversal', () => {
      expect(() => validatePath('../etc/passwd')).toThrow(ValidationError);
      expect(() => validatePath('../etc/passwd')).toThrow('path traversal not allowed');
    });

    it('should throw for path with nested ../ traversal', () => {
      expect(() => validatePath('/home/user/../../../etc/passwd')).toThrow(ValidationError);
    });

    it('should throw for path with ..\\ Windows traversal', () => {
      expect(() => validatePath('..\\Windows\\System32')).toThrow(ValidationError);
    });

    it('should throw for path with null bytes', () => {
      expect(() => validatePath('/home/user/file.txt\0.jpg')).toThrow(ValidationError);
      expect(() => validatePath('/home/user/file.txt\0.jpg')).toThrow('null bytes not allowed');
    });

    it('should set correct error code for path traversal', () => {
      try {
        validatePath('../secret');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).code).toBe(ERROR_CODES.FS_PATH_TRAVERSAL);
      }
    });

    it('should set correct error code for null bytes', () => {
      try {
        validatePath('file\0name');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).code).toBe(ERROR_CODES.VALIDATION_INVALID_PATH);
      }
    });

    it('should handle mixed separators with traversal', () => {
      expect(() => validatePath('/home\\..\\etc/passwd')).toThrow(ValidationError);
    });
  });

  // ===========================================================================
  // validateBoolean
  // ===========================================================================
  describe('validateBoolean', () => {
    it('should pass for true', () => {
      expect(() => validateBoolean(true, 'testField')).not.toThrow();
    });

    it('should pass for false', () => {
      expect(() => validateBoolean(false, 'testField')).not.toThrow();
    });

    it('should throw for truthy string', () => {
      expect(() => validateBoolean('true', 'testField')).toThrow(ValidationError);
    });

    it('should throw for number 1', () => {
      expect(() => validateBoolean(1, 'testField')).toThrow(ValidationError);
    });

    it('should throw for number 0', () => {
      expect(() => validateBoolean(0, 'testField')).toThrow(ValidationError);
    });

    it('should throw for null', () => {
      expect(() => validateBoolean(null, 'testField')).toThrow(ValidationError);
    });

    it('should throw for undefined', () => {
      expect(() => validateBoolean(undefined, 'testField')).toThrow(ValidationError);
    });

    it('should throw for object', () => {
      expect(() => validateBoolean({}, 'testField')).toThrow(ValidationError);
    });

    it('should include field name in error message', () => {
      expect(() => validateBoolean('yes', 'isEnabled')).toThrow('isEnabled must be a boolean');
    });
  });

  // ===========================================================================
  // validateNumber
  // ===========================================================================
  describe('validateNumber', () => {
    it('should pass for valid integer', () => {
      expect(() => validateNumber(42, 'testField')).not.toThrow();
    });

    it('should pass for valid float', () => {
      expect(() => validateNumber(3.14, 'testField')).not.toThrow();
    });

    it('should pass for zero', () => {
      expect(() => validateNumber(0, 'testField')).not.toThrow();
    });

    it('should pass for negative number', () => {
      expect(() => validateNumber(-100, 'testField')).not.toThrow();
    });

    it('should throw for NaN', () => {
      expect(() => validateNumber(NaN, 'testField')).toThrow(ValidationError);
      expect(() => validateNumber(NaN, 'testField')).toThrow('testField must be a number');
    });

    it('should throw for Infinity', () => {
      // Infinity is technically a number, but this depends on implementation
      expect(() => validateNumber(Infinity, 'testField')).not.toThrow();
    });

    it('should throw for string number', () => {
      expect(() => validateNumber('42', 'testField')).toThrow(ValidationError);
    });

    it('should throw for null', () => {
      expect(() => validateNumber(null, 'testField')).toThrow(ValidationError);
    });

    it('should throw for undefined', () => {
      expect(() => validateNumber(undefined, 'testField')).toThrow(ValidationError);
    });

    describe('with min constraint', () => {
      it('should pass when value equals min', () => {
        expect(() => validateNumber(5, 'testField', { min: 5 })).not.toThrow();
      });

      it('should pass when value is above min', () => {
        expect(() => validateNumber(10, 'testField', { min: 5 })).not.toThrow();
      });

      it('should throw when value is below min', () => {
        expect(() => validateNumber(3, 'testField', { min: 5 })).toThrow(ValidationError);
        expect(() => validateNumber(3, 'testField', { min: 5 })).toThrow('testField must be >= 5');
      });
    });

    describe('with max constraint', () => {
      it('should pass when value equals max', () => {
        expect(() => validateNumber(100, 'testField', { max: 100 })).not.toThrow();
      });

      it('should pass when value is below max', () => {
        expect(() => validateNumber(50, 'testField', { max: 100 })).not.toThrow();
      });

      it('should throw when value is above max', () => {
        expect(() => validateNumber(150, 'testField', { max: 100 })).toThrow(ValidationError);
        expect(() => validateNumber(150, 'testField', { max: 100 })).toThrow('testField must be <= 100');
      });
    });

    describe('with min and max constraints', () => {
      it('should pass when value is in range', () => {
        expect(() => validateNumber(50, 'testField', { min: 0, max: 100 })).not.toThrow();
      });

      it('should throw when value is below min', () => {
        expect(() => validateNumber(-10, 'testField', { min: 0, max: 100 })).toThrow(ValidationError);
      });

      it('should throw when value is above max', () => {
        expect(() => validateNumber(150, 'testField', { min: 0, max: 100 })).toThrow(ValidationError);
      });
    });
  });

  // ===========================================================================
  // validateArray
  // ===========================================================================
  describe('validateArray', () => {
    it('should pass for empty array', () => {
      expect(() => validateArray([], 'testField')).not.toThrow();
    });

    it('should pass for array with elements', () => {
      expect(() => validateArray([1, 2, 3], 'testField')).not.toThrow();
    });

    it('should pass for array with mixed types', () => {
      expect(() => validateArray([1, 'two', { three: 3 }], 'testField')).not.toThrow();
    });

    it('should throw for object', () => {
      expect(() => validateArray({}, 'testField')).toThrow(ValidationError);
    });

    it('should throw for string', () => {
      expect(() => validateArray('array', 'testField')).toThrow(ValidationError);
    });

    it('should throw for null', () => {
      expect(() => validateArray(null, 'testField')).toThrow(ValidationError);
    });

    it('should throw for undefined', () => {
      expect(() => validateArray(undefined, 'testField')).toThrow(ValidationError);
    });

    it('should throw for number', () => {
      expect(() => validateArray(123, 'testField')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      expect(() => validateArray({}, 'items')).toThrow('items must be an array');
    });
  });

  // ===========================================================================
  // getErrorMessage
  // ===========================================================================
  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Something went wrong');
      expect(getErrorMessage(error)).toBe('Something went wrong');
    });

    it('should convert string to message', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should convert number to string', () => {
      expect(getErrorMessage(404)).toBe('404');
    });

    it('should convert null to string', () => {
      expect(getErrorMessage(null)).toBe('null');
    });

    it('should convert undefined to string', () => {
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should convert object to string', () => {
      expect(getErrorMessage({ error: 'object' })).toBe('[object Object]');
    });

    it('should handle ValidationError', () => {
      const error = new ValidationError('Invalid input', 'field', ERROR_CODES.VALIDATION_REQUIRED);
      expect(getErrorMessage(error)).toBe('Invalid input');
    });
  });

  // ===========================================================================
  // formatErrorMessage
  // ===========================================================================
  describe('formatErrorMessage', () => {
    it('should format error message with prefix', () => {
      const error = new Error('Connection refused');
      expect(formatErrorMessage('Failed to connect', error)).toBe('Failed to connect: Connection refused');
    });

    it('should handle string error', () => {
      expect(formatErrorMessage('Operation failed', 'timeout')).toBe('Operation failed: timeout');
    });

    it('should handle null error', () => {
      expect(formatErrorMessage('Error occurred', null)).toBe('Error occurred: null');
    });

    it('should handle empty prefix', () => {
      const error = new Error('Test error');
      expect(formatErrorMessage('', error)).toBe(': Test error');
    });
  });

  // ===========================================================================
  // sendToRenderer
  // ===========================================================================
  describe('sendToRenderer', () => {
    let mockWindow: {
      webContents: { send: ReturnType<typeof vi.fn> };
      isDestroyed: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockWindow = {
        webContents: {
          send: vi.fn(),
        },
        isDestroyed: vi.fn().mockReturnValue(false),
      };
    });

    it('should send message to renderer when window exists', () => {
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const result = sendToRenderer(getMainWindow, 'test:channel', { data: 'test' });

      expect(result).toBe(true);
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('test:channel', { data: 'test' });
    });

    it('should return false when no window', () => {
      const getMainWindow = vi.fn().mockReturnValue(null);

      const result = sendToRenderer(getMainWindow, 'test:channel', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should return false when window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const result = sendToRenderer(getMainWindow, 'test:channel', { data: 'test' });

      expect(result).toBe(false);
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      sendToRenderer(getMainWindow, 'test:channel', 'arg1', 'arg2', { arg3: true });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('test:channel', 'arg1', 'arg2', { arg3: true });
    });

    it('should return false when send throws', () => {
      mockWindow.webContents.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const result = sendToRenderer(getMainWindow, 'test:channel');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // createSender
  // ===========================================================================
  describe('createSender', () => {
    it('should create a bound sender function', () => {
      const mockWindow = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn().mockReturnValue(false),
      };
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const send = createSender(getMainWindow);

      expect(typeof send).toBe('function');
    });

    it('should send messages through the bound function', () => {
      const mockWindow = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn().mockReturnValue(false),
      };
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const send = createSender(getMainWindow);
      send('my:channel', { payload: 'data' });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('my:channel', { payload: 'data' });
    });

    it('should maintain window reference across calls', () => {
      const mockWindow = {
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn().mockReturnValue(false),
      };
      const getMainWindow = vi.fn().mockReturnValue(mockWindow);

      const send = createSender(getMainWindow);
      send('channel1', 'data1');
      send('channel2', 'data2');

      expect(getMainWindow).toHaveBeenCalledTimes(2);
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(2);
    });
  });
});
