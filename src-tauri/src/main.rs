#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod lexicon;
mod source;

use lexicon::{build_xml, diff_lexicons, new_lexicon, parse_xml, DiffOptions};
use source::{resolve_source, Source};
use std::fs;
use std::sync::Mutex;
use tauri::State;

// State to track modified status (used for close confirmation)
struct AppState {
    modified: Mutex<bool>,
}

#[tauri::command]
async fn open_file() -> Result<Option<serde_json::Value>, String> {
    println!("Backend: open_file command received");
    let task = rfd::AsyncFileDialog::new()
        .add_filter("XML files", &["xml"])
        .add_filter("All files", &["*"])
        .pick_file();

    let file = task.await;

    if let Some(file_handle) = file {
        let path = file_handle.path().to_owned();
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

        let path_str = path.to_string_lossy().to_string();
        let res = serde_json::json!({
            "filePath": path_str,
            "content": content
        });
        Ok(Some(res))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn parse_xml_command(content: String) -> Result<serde_json::Value, String> {
    parse_xml(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn build_xml_command(data: serde_json::Value) -> Result<String, String> {
    build_xml(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_lexicon_command(name: String, language: String) -> Result<serde_json::Value, String> {
    Ok(new_lexicon(&name, &language))
}

#[tauri::command]
async fn save_file_dialog_command() -> Result<Option<String>, String> {
    let task = rfd::AsyncFileDialog::new()
        .add_filter("XML files", &["xml"])
        .add_filter("All files", &["*"])
        .save_file();

    let file = task.await;

    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn save_file_command(file_path: String, content: String) -> Result<bool, String> {
    fs::write(file_path, content)
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_modified(modified: bool, state: State<AppState>) -> Result<bool, String> {
    if let Ok(mut m) = state.modified.lock() {
        *m = modified;
        Ok(modified)
    } else {
        Err("Failed to lock state".into())
    }
}

#[tauri::command]
async fn diff(
    left: Source,
    right: Source,
    options: DiffOptions,
) -> Result<serde_json::Value, String> {
    diff_lexicons(
        resolve_source(&left).map_err(|e| e.to_string())?,
        resolve_source(&right).map_err(|e| e.to_string())?,
        options,
    )
}

#[tauri::command]
async fn get_lexicon_from_source(source: Source) -> Result<serde_json::Value, String> {
    let lex = resolve_source(&source).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "lexicon": lex }))
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            modified: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            parse_xml_command,
            build_xml_command,
            create_lexicon_command,
            save_file_dialog_command,
            save_file_command,
            set_modified,
            diff,
            get_lexicon_from_source
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
