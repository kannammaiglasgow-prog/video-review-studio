import { exec } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return new Promise<Response>((resolve) => {
    // Windows PowerShell script to open a native folder browser dialog
    const psCommand = `
      Add-Type -AssemblyName System.Windows.Forms;
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
      $dialog.Description = "Select CreatorOS Local Media Source Folder";
      $dialog.ShowNewFolderButton = $true;
      $res = $dialog.ShowDialog();
      if ($res -eq 'OK') {
        Write-Output $dialog.SelectedPath;
      }
    `;

    exec(`powershell -ExecutionPolicy Bypass -Command "${psCommand.replace(/\n/g, ' ')}"`, (err, stdout, stderr) => {
      if (err) {
        resolve(NextResponse.json({ error: "Folder picker failed to open" }, { status: 500 }));
        return;
      }
      const selectedPath = stdout.trim();
      if (!selectedPath) {
        resolve(NextResponse.json({ error: "Folder selection cancelled" }, { status: 400 }));
        return;
      }
      resolve(NextResponse.json({ path: selectedPath }));
    });
  });
}
