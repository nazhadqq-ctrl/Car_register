; Inno Setup Script for Traffic Check System
; سیستەمی پشکنین و تۆمارکردنی ئوتومبێل - هاتووچۆی سلێمانی

#define MyAppName "TrafficCheck"
#define MyAppTitle "سیستەمی پشکنینی هاتووچۆ"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "Traffic Police Directorate - Sulaymaniyah"
#define MyAppExeName "TrafficCheck.exe"
#define SourceDir "C:\Users\Nazha\Desktop\TrafficCheck_Setup"
#define NodeExePath "C:\Program Files\nodejs\node.exe"

[Setup]
AppId={{9F5D3C82-4B21-4E65-B8A1-8A1C5A5D33C2}
AppName={#MyAppTitle}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName=C:\TrafficCheck
DisableDirPage=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=C:\Users\Nazha\Desktop\TrafficCheck_Setup_Output
OutputBaseFilename=Setup_TrafficCheck_Standalone
SetupIconFile={#SourceDir}\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
; Main Executable and Core Scripts
Source: "{#SourceDir}\TrafficCheck.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\auto-updater.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Update_TrafficCheck.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\db.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Start_Silent_Print_Chrome.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Start_Silent_Print_Edge.bat"; DestDir: "{app}"; Flags: ignoreversion

; Embedded Standalone Portable Node.js Runtime (Makes it work on any Windows 10/11 without installing Node)
Source: "{#NodeExePath}"; DestDir: "{app}"; DestName: "node.exe"; Flags: ignoreversion

; Web Assets (HTML, CSS, JS, Fonts, Images)
Source: "{#SourceDir}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

; Node Modules Dependencies
Source: "{#SourceDir}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; WorkingDir: "{app}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; WorkingDir: "{app}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "دەستپێکردنی بەرنامە (Launch {#MyAppTitle})"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  OneDriveDesktop: string;
  SourceLnk: string;
begin
  if CurStep = ssPostInstall then
  begin
    SourceLnk := ExpandConstant('{autodesktop}\{#MyAppName}.lnk');
    if not FileExists(SourceLnk) then
      SourceLnk := ExpandConstant('{commondesktop}\{#MyAppName}.lnk');
    if not FileExists(SourceLnk) then
      SourceLnk := ExpandConstant('{userdesktop}\{#MyAppName}.lnk');

    // Check OneDrive Desktop
    OneDriveDesktop := ExpandConstant('{userdocs}\..\Desktop');
    if not DirExists(OneDriveDesktop) then
      OneDriveDesktop := ExpandConstant('{%USERPROFILE}\OneDrive\Desktop');

    if DirExists(OneDriveDesktop) and FileExists(SourceLnk) then
    begin
      FileCopy(SourceLnk, OneDriveDesktop + '\{#MyAppName}.lnk', False);
    end;
  end;
end;
