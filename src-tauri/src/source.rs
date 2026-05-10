use serde_json::{Map, Value};
use std::path::Path;
use std::process::Command;

use crate::lexicon::parse_xml;

#[derive(serde::Deserialize, Debug)]
#[serde(tag = "type")]
pub enum Source {
    #[serde(rename = "object")]
    Object { data: Option<Value> },
    #[serde(rename = "disk")]
    Disk { path: String },
    #[serde(rename = "git")]
    Git { path: String, rev: Option<String> },
}

pub fn resolve_source(src: &Source) -> Result<Value, String> {
    match src {
        Source::Object { data } => {
            if let Some(data) = data {
                if let Some(lexicon) = data.get("lexicon") {
                    Ok(lexicon.clone())
                } else {
                    Ok(data.clone())
                }
            } else {
                Ok(Value::Object(Map::new()))
            }
        }
        Source::Disk { path } => {
            let content = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
            let parsed = parse_xml(&content).map_err(|err| err.to_string())?;
            Ok(parsed
                .get("lexicon")
                .cloned()
                .unwrap_or(Value::Object(Map::new())))
        }
        Source::Git { path, rev } => {
            let rev = rev.as_deref().unwrap_or("HEAD");
            let workdir = Path::new(path).parent().ok_or("Invalid path")?;
            let workdir_str = workdir.to_str().ok_or("Invalid path string")?;

            let top_output = Command::new("git")
                .args(["-C", workdir_str, "rev-parse", "--show-toplevel"])
                .output()
                .map_err(|err| err.to_string())?;

            if !top_output.status.success() {
                return Err(String::from_utf8_lossy(&top_output.stderr).to_string());
            }
            let top = String::from_utf8_lossy(&top_output.stdout)
                .trim()
                .to_string();

            let _rel_path =
                pathdiff::diff_paths(path, &top).ok_or("Could not determine relative path")?;

            let full_path = std::fs::canonicalize(path).map_err(|err| err.to_string())?;
            let top_path = std::fs::canonicalize(&top).map_err(|err| err.to_string())?;
            let rel = full_path
                .strip_prefix(&top_path)
                .map_err(|err| err.to_string())?;
            let rel_str = rel.to_str().ok_or("Invalid path string")?;

            let show_arg = format!("{}:{}", rev, rel_str);
            let blob = Command::new("git")
                .args(["-C", &top, "show", &show_arg])
                .output()
                .map_err(|err| err.to_string())?;

            if !blob.status.success() {
                return Err(String::from_utf8_lossy(&blob.stderr).to_string());
            }

            let content = String::from_utf8_lossy(&blob.stdout).to_string();
            let parsed = parse_xml(&content).map_err(|err| err.to_string())?;
            Ok(parsed
                .get("lexicon")
                .cloned()
                .unwrap_or(Value::Object(Map::new())))
        }
    }
}
