Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = projectDir & "\AttendPro Launcher.ps1"

If Not fso.FileExists(launcher) Then
  MsgBox "AttendPro Launcher.ps1 was not found.", 16, "AttendPro"
  WScript.Quit
End If

command = "powershell -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & launcher & Chr(34)
shell.Run command, 0, False
