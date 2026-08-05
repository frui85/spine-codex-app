#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

#define COMMAND_CAPACITY 32768
#define PATH_CAPACITY 32768
#define LOG_CAPACITY 12000

static int append_char(wchar_t *buffer, size_t *length, wchar_t value) {
  if (*length + 1 >= COMMAND_CAPACITY) return 0;
  buffer[(*length)++] = value;
  buffer[*length] = L'\0';
  return 1;
}

static int append_argument(
  wchar_t *buffer,
  size_t *length,
  const wchar_t *argument
) {
  if (*length && !append_char(buffer, length, L' ')) return 0;
  if (!append_char(buffer, length, L'"')) return 0;
  size_t slashes = 0;
  for (const wchar_t *cursor = argument;; cursor++) {
    if (*cursor == L'\\') {
      slashes++;
      continue;
    }
    if (*cursor == L'"') {
      for (size_t index = 0; index < slashes * 2 + 1; index++) {
        if (!append_char(buffer, length, L'\\')) return 0;
      }
      if (!append_char(buffer, length, L'"')) return 0;
      slashes = 0;
      continue;
    }
    if (*cursor == L'\0') {
      for (size_t index = 0; index < slashes * 2; index++) {
        if (!append_char(buffer, length, L'\\')) return 0;
      }
      break;
    }
    for (size_t index = 0; index < slashes; index++) {
      if (!append_char(buffer, length, L'\\')) return 0;
    }
    slashes = 0;
    if (!append_char(buffer, length, *cursor)) return 0;
  }
  return append_char(buffer, length, L'"');
}

static int executable_directory(wchar_t *directory, size_t capacity) {
  DWORD length = GetModuleFileNameW(NULL, directory, (DWORD)capacity);
  if (!length || length >= capacity) return 0;
  while (length > 0 && directory[length - 1] != L'\\' && directory[length - 1] != L'/') {
    length--;
  }
  if (!length) return 0;
  directory[length - 1] = L'\0';
  return 1;
}

static int join_path(
  wchar_t *output,
  size_t capacity,
  const wchar_t *directory,
  const wchar_t *relative
) {
  int written = _snwprintf(output, capacity, L"%ls\\%ls", directory, relative);
  return written > 0 && (size_t)written < capacity;
}

static void show_windows_error(const wchar_t *context, DWORD error) {
  wchar_t system_message[1024] = L"";
  FormatMessageW(
    FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    NULL,
    error,
    0,
    system_message,
    (DWORD)(sizeof(system_message) / sizeof(system_message[0])),
    NULL
  );
  wchar_t message[1400];
  _snwprintf(message, 1400, L"%ls\n\n%ls", context, system_message);
#ifdef SPINE_CLI_SHIM
  DWORD written = 0;
  HANDLE error_handle = GetStdHandle(STD_ERROR_HANDLE);
  if (error_handle && error_handle != INVALID_HANDLE_VALUE) {
    WriteConsoleW(error_handle, message, (DWORD)wcslen(message), &written, NULL);
  }
#else
  MessageBoxW(NULL, message, L"SpineCodex App", MB_OK | MB_ICONERROR);
#endif
}

static int standard_output_available(void) {
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!output || output == INVALID_HANDLE_VALUE) return 0;
  SetLastError(NO_ERROR);
  DWORD type = GetFileType(output);
  return type != FILE_TYPE_UNKNOWN || GetLastError() == NO_ERROR;
}

static void show_child_log(HANDLE log_file) {
  FlushFileBuffers(log_file);
  SetFilePointer(log_file, 0, NULL, FILE_BEGIN);
  char bytes[LOG_CAPACITY + 1];
  DWORD count = 0;
  if (!ReadFile(log_file, bytes, LOG_CAPACITY, &count, NULL)) count = 0;
  bytes[count] = '\0';
  UINT encoding = CP_UTF8;
  int wide_length = MultiByteToWideChar(encoding, MB_ERR_INVALID_CHARS, bytes, count, NULL, 0);
  if (!wide_length) {
    encoding = CP_ACP;
    wide_length = MultiByteToWideChar(encoding, 0, bytes, count, NULL, 0);
  }
  if (!wide_length) {
    MessageBoxW(NULL, L"The launcher failed without readable output.", L"SpineCodex App", MB_OK | MB_ICONERROR);
    return;
  }
  wchar_t *message = LocalAlloc(LPTR, (wide_length + 1) * sizeof(wchar_t));
  if (!message) return;
  MultiByteToWideChar(encoding, 0, bytes, count, message, wide_length);
  message[wide_length] = L'\0';
  MessageBoxW(NULL, message, L"SpineCodex App", MB_OK | MB_ICONERROR);
  LocalFree(message);
}

int WINAPI wWinMain(
  HINSTANCE instance,
  HINSTANCE previous_instance,
  PWSTR command_line,
  int show_command
) {
  (void)instance;
  (void)previous_instance;
  (void)command_line;
  (void)show_command;

  wchar_t directory[PATH_CAPACITY];
  wchar_t node_path[PATH_CAPACITY];
  wchar_t script_path[PATH_CAPACITY];
  if (!executable_directory(directory, PATH_CAPACITY)) {
    show_windows_error(L"Unable to resolve the launcher directory.", GetLastError());
    return 1;
  }
#ifdef SPINE_CLI_SHIM
  if (!join_path(node_path, PATH_CAPACITY, directory, L"..\\..\\runtime\\node.exe") ||
      !join_path(script_path, PATH_CAPACITY, directory, L"spine-codex.mjs")) {
#else
  if (!join_path(node_path, PATH_CAPACITY, directory, L"runtime\\node.exe") ||
      !join_path(script_path, PATH_CAPACITY, directory, L"wrapper\\spine-app.mjs")) {
#endif
    show_windows_error(L"The bundled runtime path is too long.", ERROR_BUFFER_OVERFLOW);
    return 1;
  }

  int argument_count = 0;
  wchar_t **arguments = CommandLineToArgvW(GetCommandLineW(), &argument_count);
  if (!arguments) {
    show_windows_error(L"Unable to parse launcher arguments.", GetLastError());
    return 1;
  }
  wchar_t *child_command = LocalAlloc(LPTR, COMMAND_CAPACITY * sizeof(wchar_t));
  if (!child_command) {
    LocalFree(arguments);
    show_windows_error(L"Unable to allocate the child command line.", ERROR_OUTOFMEMORY);
    return 1;
  }
  size_t command_length = 0;
  int command_ok = append_argument(child_command, &command_length, node_path) &&
    append_argument(child_command, &command_length, script_path);
  for (int index = 1; command_ok && index < argument_count; index++) {
    command_ok = append_argument(child_command, &command_length, arguments[index]);
  }
  LocalFree(arguments);
  if (!command_ok) {
    LocalFree(child_command);
    show_windows_error(L"The launcher command line is too long.", ERROR_BUFFER_OVERFLOW);
    return 1;
  }

  STARTUPINFOW startup = {0};
  PROCESS_INFORMATION process = {0};
  startup.cb = sizeof(startup);
  HANDLE log_file = INVALID_HANDLE_VALUE;
  wchar_t log_path[PATH_CAPACITY] = L"";
#ifndef SPINE_CLI_SHIM
  int capture_output = !standard_output_available();
  if (capture_output) {
    wchar_t temporary_directory[PATH_CAPACITY];
    if (GetTempPathW(PATH_CAPACITY, temporary_directory) &&
        GetTempFileNameW(temporary_directory, L"SCA", 0, log_path)) {
      SECURITY_ATTRIBUTES security = {sizeof(security), NULL, TRUE};
      log_file = CreateFileW(
        log_path,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        &security,
        CREATE_ALWAYS,
        FILE_ATTRIBUTE_TEMPORARY,
        NULL
      );
      if (log_file != INVALID_HANDLE_VALUE) {
        startup.dwFlags |= STARTF_USESTDHANDLES;
        startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        startup.hStdOutput = log_file;
        startup.hStdError = log_file;
      }
    }
  }
#endif

  BOOL created = CreateProcessW(
    node_path,
    child_command,
    NULL,
    NULL,
    TRUE,
    CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
    NULL,
    NULL,
    &startup,
    &process
  );
  LocalFree(child_command);
  if (!created) {
    DWORD error = GetLastError();
    if (log_file != INVALID_HANDLE_VALUE) CloseHandle(log_file);
    if (log_path[0]) DeleteFileW(log_path);
    show_windows_error(L"Unable to start the bundled Node.js runtime.", error);
    return 1;
  }
  CloseHandle(process.hThread);
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD status = 1;
  GetExitCodeProcess(process.hProcess, &status);
  CloseHandle(process.hProcess);

#ifndef SPINE_CLI_SHIM
  if (status != 0 && log_file != INVALID_HANDLE_VALUE) show_child_log(log_file);
#endif
  if (log_file != INVALID_HANDLE_VALUE) CloseHandle(log_file);
  if (log_path[0]) DeleteFileW(log_path);
  return (int)status;
}
