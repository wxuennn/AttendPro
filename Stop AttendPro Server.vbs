Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

command = "powershell -NoProfile -ExecutionPolicy Bypass -Command " & _
  """$project='" & Replace(projectDir, "'", "''") & "'; " & _
  "Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($project + '\*') } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }; " & _
  "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'server.js' -and $_.CommandLine -like ('*' + $project + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"""

shell.Run command, 0, True
MsgBox "AttendPro public website stopped.", 64, "AttendPro"
