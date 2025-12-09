use serde_json::{Value, Map};
use std::collections::{HashSet, HashMap};
use std::process::Command;
use std::path::Path;
use crate::xml_utils::parse_xml;

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
pub struct DiffOptions {
    pub ignore_timestamps: Option<bool>,
    pub include_entry_fields: Option<Vec<String>>,
    pub include_sense_fields: Option<Vec<String>>,
}

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
            if let Some(d) = data {
                if let Some(lex) = d.get("lexicon") {
                    Ok(lex.clone())
                } else {
                    Ok(d.clone())
                }
            } else {
                Ok(Value::Object(Map::new()))
            }
        },
        Source::Disk { path } => {
            let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            let parsed = parse_xml(&content).map_err(|e| e.to_string())?;
            Ok(parsed.get("lexicon").cloned().unwrap_or(Value::Object(Map::new())))
        },
        Source::Git { path, rev } => {
            let rev = rev.as_deref().unwrap_or("HEAD");
            let workdir = Path::new(path).parent().ok_or("Invalid path")?;
            
            // Get repo root
            let top_output = Command::new("git")
                .args(&["-C", workdir.to_str().unwrap(), "rev-parse", "--show-toplevel"])
                .output()
                .map_err(|e| e.to_string())?;
                
            if !top_output.status.success() {
                return Err(String::from_utf8_lossy(&top_output.stderr).to_string());
            }
            let top = String::from_utf8_lossy(&top_output.stdout).trim().to_string();
            
            // Rel path
            let _rel_path = pathdiff::diff_paths(path, &top).ok_or("Could not determine relative path")?; 
            // Note: pathdiff might not be available, let's just do manual strip if possible or assume logic.
            // Actually, we can just use the provided path if it's correct for git show usually, 
            // but git show REVISION:PATH expects PATH relative to root.
            
            // Alternative: use std::path logic
            let full_path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
            let top_path = std::fs::canonicalize(&top).map_err(|e| e.to_string())?;
            let rel = full_path.strip_prefix(&top_path).map_err(|e| e.to_string())?;
            let rel_str = rel.to_str().ok_or("Invalid path string")?;
            
            let show_arg = format!("{}:{}", rev, rel_str);
            let blob = Command::new("git")
                .args(&["-C", &top, "show", &show_arg])
                .output()
                .map_err(|e| e.to_string())?;

            if !blob.status.success() {
                 return Err(String::from_utf8_lossy(&blob.stderr).to_string());
            }
            
            let content = String::from_utf8_lossy(&blob.stdout).to_string();
            let parsed = parse_xml(&content).map_err(|e| e.to_string())?;
            Ok(parsed.get("lexicon").cloned().unwrap_or(Value::Object(Map::new())))
        }
    }
}

pub fn diff_lexicons(left: Value, right: Value, options: DiffOptions) -> Result<Value, String> {
    let ignore_timestamps = options.ignore_timestamps.unwrap_or(true);
    
    let left_canon = canonicalize_lexicon(left, ignore_timestamps)?;
    let right_canon = canonicalize_lexicon(right, ignore_timestamps)?;
    
    let diff = diff_entries_core(left_canon, right_canon, &options)?;
    
    Ok(serde_json::json!({
        "summary": {
            "entries_added": diff["added"].as_array().map(|a| a.len()).unwrap_or(0),
            "entries_removed": diff["removed"].as_array().map(|a| a.len()).unwrap_or(0),
            "entries_modified": diff["modified"].as_array().map(|a| a.len()).unwrap_or(0),
        },
        "entries": diff
    }))
}

fn canonicalize_lexicon(lex: Value, ignore_timestamps: bool) -> Result<Value, String> {
    let mut lex = lex;
    if let Value::Object(ref mut map) = lex {
        if let Some(entries) = map.get_mut("entry") {
            if let Value::Array(list) = entries {
                let mut new_list = Vec::new();
                for e in list {
                     new_list.push(norm_entry(e.clone(), ignore_timestamps));
                }
                // Sort by ID then Lexical unit
                new_list.sort_by(|a, b| {
                    let id_a = get_id(a);
                    let id_b = get_id(b);
                    id_a.cmp(&id_b)
                });
                *entries = Value::Array(new_list);
            }
        }
    }
    Ok(lex)
}

fn norm_entry(mut e: Value, ignore_timestamps: bool) -> Value {
    if let Value::Object(ref mut map) = e {
        // Handle attrs
        if ignore_timestamps {
             if let Some(attrs) = map.get_mut("$") {
                 if let Value::Object(ref mut amap) = attrs {
                     amap.remove("dateModified");
                 }
             }
        }
        
        // Normalize fields
        for k in &["lexical-unit", "morph-type"] {
            if let Some(val) = map.get_mut(*k) {
                *val = ensure_list_first_str(val);
            }
        }
        
        // Normalize variants
        if let Some(vars) = map.get_mut("variant") {
            *vars = sorted_variants(vars);
        }
        
        // Normalize senses
        if let Some(senses) = map.get_mut("sense") {
            *senses = sorted_senses(senses);
        }
        
        // Custom fields
        let std_keys: HashSet<_> = ["$", "lexical-unit", "morph-type", "sense", "variant"].iter().copied().collect();
        for (k, v) in map.iter_mut() {
            if !std_keys.contains(k.as_str()) {
                 *v = ensure_list_first_str(v);
            }
        }
    }
    e
}

fn ensure_list_first_str(v: &mut Value) -> Value {
    match v {
        Value::Array(arr) => {
            if arr.is_empty() {
                Value::Array(vec![Value::String("".to_string())])
            } else {
                 Value::Array(vec![arr[0].clone()])
            }
        },
        Value::String(_) => Value::Array(vec![v.clone()]),
        Value::Null => Value::Array(vec![Value::String("".to_string())]),
        _ => Value::Array(vec![Value::String(v.to_string())])
    }
}

fn sorted_variants(v: &Value) -> Value {
    let mut items = Vec::new();
    if let Value::Array(arr) = v {
        for n in arr {
            if let Value::String(s) = n {
                if !s.is_empty() {
                    items.push(s.clone());
                }
            }
        }
    }
    items.sort();
    Value::Array(items.into_iter().map(Value::String).collect())
}

fn sorted_senses(v: &Value) -> Value {
    let mut items = Vec::new();
    if let Value::Array(arr) = v {
        items = arr.clone();
    }
    items.sort_by(|a, b| {
        let order_a = get_attr(a, "order");
        let id_a = get_attr(a, "id");
        let order_b = get_attr(b, "order");
        let id_b = get_attr(b, "id");
        (order_a, id_a).cmp(&(order_b, id_b))
    });
    
    // Normalize sense fields
    for s in &mut items {
        if let Value::Object(ref mut map) = s {
             for k in &["grammatical-category", "gloss"] {
                 if let Some(val) = map.get_mut(*k) {
                     *val = ensure_list_first_str(val);
                 }
             }
        }
    }
    
    Value::Array(items)
}

fn get_attr(v: &Value, name: &str) -> String {
    v.get("$").and_then(|a| a.get(name)).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default()
}

fn get_id(v: &Value) -> String {
    let id = get_attr(v, "id");
    if !id.is_empty() { return id; }
    // Fallback to lexical unit
    v.get("lexical-unit").and_then(|a| a.as_array()).and_then(|a| a.get(0)).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default()
}

fn diff_entries_core(left: Value, right: Value, _opts: &DiffOptions) -> Result<Value, String> {
    let left_entries = left.get("entry").and_then(|e| e.as_array()).cloned().unwrap_or_default();
    let right_entries = right.get("entry").and_then(|e| e.as_array()).cloned().unwrap_or_default();
    
    let mut left_idx = HashMap::new();
    for e in &left_entries {
        left_idx.insert(get_id(e), e.clone());
    }
    
    let mut right_idx = HashMap::new();
    for e in &right_entries {
        right_idx.insert(get_id(e), e.clone());
    }
    
    let left_ids: HashSet<_> = left_idx.keys().cloned().collect();
    let right_ids: HashSet<_> = right_idx.keys().cloned().collect();
    
    let mut added: Vec<_> = right_ids.difference(&left_ids).cloned().collect();
    added.sort();
    
    let mut removed: Vec<_> = left_ids.difference(&right_ids).cloned().collect();
    removed.sort();
    
    let mut modified = Vec::new();
    let common_ids: HashSet<_> = left_ids.intersection(&right_ids).cloned().collect();
    let mut common_sorted: Vec<_> = common_ids.into_iter().collect();
    common_sorted.sort();
    
    for id in common_sorted {
        let e1 = left_idx.get(&id).unwrap();
        let e2 = right_idx.get(&id).unwrap();
        
        let fields = diff_entry_fields(e1, e2, _opts);
        let senses = diff_entry_senses(e1, e2, _opts);
        
        if !fields.is_empty() || !senses["added"].as_array().unwrap().is_empty() || !senses["removed"].as_array().unwrap().is_empty() || !senses["modified"].as_array().unwrap().is_empty() { // reordered todo
             modified.push(serde_json::json!({
                 "id": id,
                 "lexical_unit": e1.get("lexical-unit").and_then(|a| a.as_array()).and_then(|v| v.get(0)).and_then(|s| s.as_str()).unwrap_or(""),
                 "fields": fields,
                 "senses": senses
             }));
        }
    }
    
    Ok(serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified
    }))
}

fn diff_entry_fields(e1: &Value, e2: &Value, _opts: &DiffOptions) -> Vec<Value> {
    let mut changes = Vec::new();
    // Simplified: compare all keys except senses
    let map1 = e1.as_object().unwrap();
    let map2 = e2.as_object().unwrap();
    
    let keys: HashSet<_> = map1.keys().chain(map2.keys()).filter(|k| *k != "sense" && *k != "$").collect();
    
    for k in keys {
        let v1 = map1.get(k).and_then(|a| a.as_array()).and_then(|x| x.get(0)).and_then(|s| s.as_str()).unwrap_or("");
        let v2 = map2.get(k).and_then(|a| a.as_array()).and_then(|x| x.get(0)).and_then(|s| s.as_str()).unwrap_or("");
        if v1 != v2 {
            changes.push(serde_json::json!({
                "kind": "field",
                "name": k,
                "before": v1,
                "after": v2
            }));
        }
    }
    
    // Variant special case if needed, but handled above generally if arrays are normalized to strings in lists
    
    changes
}

fn diff_entry_senses(e1: &Value, e2: &Value, _opts: &DiffOptions) -> Value {
    let s1 = e1.get("sense").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let s2 = e2.get("sense").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    
    let mut idx1 = HashMap::new();
    for s in &s1 {
        let sid = get_attr(s, "id"); // or order
        let key = if sid.is_empty() { get_attr(s, "order") } else { sid };
        idx1.insert(key, s.clone());
    }
    
    let mut idx2 = HashMap::new();
    for s in &s2 {
         let sid = get_attr(s, "id");
         let key = if sid.is_empty() { get_attr(s, "order") } else { sid };
         idx2.insert(key, s.clone());
    }
    
    let keys1: HashSet<_> = idx1.keys().cloned().collect();
    let keys2: HashSet<_> = idx2.keys().cloned().collect();
    
    let mut added: Vec<_> = keys2.difference(&keys1).cloned().collect();
    added.sort();
    let mut removed: Vec<_> = keys1.difference(&keys2).cloned().collect();
    removed.sort();
    
    let mut modified = Vec::new();
    for k in keys1.intersection(&keys2) {
        let item1 = idx1.get(k).unwrap();
        let item2 = idx2.get(k).unwrap();
        // compare fields
        let m1 = item1.as_object().unwrap();
        let m2 = item2.as_object().unwrap();
        let fkeys: HashSet<_> = m1.keys().chain(m2.keys()).filter(|x| *x != "$").collect();
        let mut sense_changes = Vec::new();
        
        for fk in fkeys {
            let v1 = m1.get(fk).and_then(|a| a.as_array()).and_then(|x| x.get(0)).and_then(|s| s.as_str()).unwrap_or("");
            let v2 = m2.get(fk).and_then(|a| a.as_array()).and_then(|x| x.get(0)).and_then(|s| s.as_str()).unwrap_or("");
            if v1 != v2 {
                sense_changes.push(serde_json::json!({
                    "kind": "field",
                    "name": fk,
                    "before": v1,
                    "after": v2
                }));
            }
        }
        
        if !sense_changes.is_empty() {
            modified.push(serde_json::json!({
                "id": k,
                "changes": sense_changes
            }));
        }
    }
    
    serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified,
        "reordered": false // simplified
    })
}
