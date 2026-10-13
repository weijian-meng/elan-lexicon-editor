use serde_json::Value;
use std::collections::{HashMap, HashSet};

use super::model::{entry_id, first_text, sense_id, DiffOptions};
use super::normalize::canonicalize_lexicon;

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

fn diff_entries_core(left: Value, right: Value, opts: &DiffOptions) -> Result<Value, String> {
    let left_entries = left
        .get("entry")
        .and_then(|entry| entry.as_array())
        .cloned()
        .unwrap_or_default();
    let right_entries = right
        .get("entry")
        .and_then(|entry| entry.as_array())
        .cloned()
        .unwrap_or_default();

    let mut left_idx = HashMap::new();
    for entry in &left_entries {
        left_idx.insert(entry_id(entry), entry.clone());
    }

    let mut right_idx = HashMap::new();
    for entry in &right_entries {
        right_idx.insert(entry_id(entry), entry.clone());
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
        let left_entry = left_idx.get(&id).unwrap();
        let right_entry = right_idx.get(&id).unwrap();

        let fields = diff_entry_fields(left_entry, right_entry, opts);
        let senses = diff_entry_senses(left_entry, right_entry, opts);

        if !fields.is_empty()
            || !senses["added"].as_array().unwrap().is_empty()
            || !senses["removed"].as_array().unwrap().is_empty()
            || !senses["modified"].as_array().unwrap().is_empty()
        {
            modified.push(serde_json::json!({
                "id": id,
                "lexical_unit": first_text(left_entry.get("lexical-unit")).unwrap_or_default(),
                "fields": fields,
                "senses": senses
            }));
        }
    }

    Ok(serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified,
        "added_details": added.iter().map(|id| &right_idx[id]).collect::<Vec<_>>(),
        "removed_details": removed.iter().map(|id| &left_idx[id]).collect::<Vec<_>>()
    }))
}

// Flatten XML-shaped values without dropping repeated text, language, or custom field names.
fn structural_fields(
    value: &Value,
    exclude_senses: bool,
) -> std::collections::BTreeMap<String, Value> {
    fn walk(value: &Value, path: String, out: &mut std::collections::BTreeMap<String, Value>) {
        match value {
            Value::Array(items) => {
                let mut seen = HashMap::<String, usize>::new();
                for (i, item) in items.iter().enumerate() {
                    let qualifier = ["name", "lang"]
                        .iter()
                        .filter_map(|key| {
                            item.get("$")
                                .and_then(|a| a.get(*key))
                                .and_then(Value::as_str)
                                .map(|v| format!("{}={}", key, v))
                        })
                        .collect::<Vec<_>>()
                        .join(", ");
                    let label = if !qualifier.is_empty() {
                        let count = seen.entry(qualifier.clone()).or_default();
                        *count += 1;
                        format!("{} [{}] [{}]", path, qualifier, count)
                    } else if items.len() > 1 {
                        format!("{} [{}]", path, i + 1)
                    } else {
                        path.clone()
                    };
                    walk(item, label, out);
                }
            }
            Value::Object(map) => {
                for (key, v) in map {
                    if key == "_" {
                        walk(v, path.clone(), out);
                    } else if key == "$" {
                        if let Some(attrs) = v.as_object() {
                            for (k, v) in attrs {
                                if k != "name" && k != "lang" && k != "id" {
                                    walk(v, format!("{} / @{}", path, k), out);
                                }
                            }
                        }
                    } else {
                        walk(v, format!("{} / {}", path, key), out);
                    }
                }
            }
            _ => {
                out.insert(path, value.clone());
            }
        }
    }
    let mut out = std::collections::BTreeMap::new();
    if let Some(map) = value.as_object() {
        for (key, v) in map {
            if key == "sense" && exclude_senses {
                continue;
            }
            if key == "$" {
                if let Some(attrs) = v.as_object() {
                    for (k, v) in attrs {
                        if k != "id" {
                            walk(v, k.clone(), &mut out);
                        }
                    }
                }
            } else {
                walk(v, key.clone(), &mut out);
            }
        }
    }
    out
}

fn diff_fields(left: &Value, right: &Value, selection: &Option<Vec<String>>) -> Vec<Value> {
    let left = structural_fields(left, true);
    let right = structural_fields(right, true);
    let keys: std::collections::BTreeSet<_> = left.keys().chain(right.keys()).collect();
    keys.into_iter()
        .filter(|key| {
            selection
                .as_ref()
                .map(|fields| {
                    fields.iter().any(|f| {
                        *key == f
                            || key.starts_with(&format!("{} [", f))
                            || key.starts_with(&format!("{} /", f))
                            || key.starts_with(&format!("field [name={}]", f))
                    })
                })
                .unwrap_or(true)
        })
        .filter_map(|key| {
            let before = left.get(key);
            let after = right.get(key);
            if before == after {
                None
            } else {
                Some(serde_json::json!({
                    "kind": "field", "name": key, "before": before, "after": after
                }))
            }
        })
        .collect()
}

fn diff_entry_fields(left: &Value, right: &Value, opts: &DiffOptions) -> Vec<Value> {
    diff_fields(left, right, &opts.include_entry_fields)
}

fn diff_entry_senses(left: &Value, right: &Value, opts: &DiffOptions) -> Value {
    let left_senses = left
        .get("sense")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let right_senses = right
        .get("sense")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut left_idx = HashMap::new();
    for sense in &left_senses {
        left_idx.insert(sense_id(sense), sense.clone());
    }

    let mut right_idx = HashMap::new();
    for sense in &right_senses {
        right_idx.insert(sense_id(sense), sense.clone());
    }

    let left_ids: HashSet<_> = left_idx.keys().cloned().collect();
    let right_ids: HashSet<_> = right_idx.keys().cloned().collect();

    let mut added: Vec<_> = right_ids.difference(&left_ids).cloned().collect();
    added.sort();
    let mut removed: Vec<_> = left_ids.difference(&right_ids).cloned().collect();
    removed.sort();

    let mut modified = Vec::new();
    for key in left_ids.intersection(&right_ids) {
        let left_item = left_idx.get(key).unwrap();
        let right_item = right_idx.get(key).unwrap();

        let sense_changes = diff_fields(left_item, right_item, &opts.include_sense_fields);

        if !sense_changes.is_empty() {
            modified.push(serde_json::json!({
                "id": key,
                "changes": sense_changes
            }));
        }
    }

    modified.sort_by_key(|v| v["id"].as_str().unwrap_or_default().to_owned());
    serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified,
        "added_details": added.iter().map(|id| &right_idx[id]).collect::<Vec<_>>(),
        "removed_details": removed.iter().map(|id| &left_idx[id]).collect::<Vec<_>>(),
        "reordered": false
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preserves_repeated_custom_fields_and_multilingual_glosses() {
        let left = serde_json::json!({"entry": [{"$": {"id": "e"},
            "variant": ["a", "b"], "field": [
                {"$": {"name": "custom"}, "_": "first"},
                {"$": {"name": "custom"}, "_": "second"}],
            "sense": [{"$": {"id": "s"}, "gloss": [
                {"$": {"lang": "en"}, "_": "one"},
                {"$": {"lang": "fr"}, "_": "un"}]}]}]});
        let mut right = left.clone();
        right["entry"][0]["variant"][1] = serde_json::json!("c");
        right["entry"][0]["field"][1]["_"] = serde_json::json!("changed");
        right["entry"][0]["sense"][0]["gloss"][1]["_"] = serde_json::json!("une");
        let result = diff_lexicons(
            left.clone(),
            right.clone(),
            DiffOptions {
                ignore_timestamps: Some(true),
                include_entry_fields: None,
                include_sense_fields: None,
            },
        )
        .unwrap();
        let changed = &result["entries"]["modified"][0];
        assert_eq!(changed["fields"].as_array().unwrap().len(), 2);
        assert_eq!(
            changed["senses"]["modified"][0]["changes"][0]["before"],
            "un"
        );
        let filtered = diff_lexicons(
            left,
            right,
            DiffOptions {
                ignore_timestamps: Some(true),
                include_entry_fields: Some(vec!["custom".into()]),
                include_sense_fields: Some(vec![]),
            },
        )
        .unwrap();
        assert_eq!(
            filtered["entries"]["modified"][0]["fields"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(filtered["entries"]["modified"][0]["senses"]["modified"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn reports_added_removed_and_modified_entries_and_senses() {
        let left = json!({
            "entry": [
                {"$": {"id": "removed"}, "lexical-unit": "gone"},
                {"$": {"id": "changed"}, "lexical-unit": "old", "sense": [
                    {"$": {"id": "s1", "order": "1"}, "grammatical-category": "n", "gloss": "old"},
                    {"$": {"id": "s_removed", "order": "2"}, "grammatical-category": "v", "gloss": "gone"}
                ]}
            ]
        });
        let right = json!({
            "entry": [
                {"$": {"id": "added"}, "lexical-unit": "new"},
                {"$": {"id": "changed"}, "lexical-unit": "new", "sense": [
                    {"$": {"id": "s1", "order": "1"}, "grammatical-category": "n", "gloss": "new"},
                    {"$": {"id": "s_added", "order": "2"}, "grammatical-category": "v", "gloss": "arrived"}
                ]}
            ]
        });

        let result = diff_lexicons(
            left,
            right,
            DiffOptions {
                ignore_timestamps: Some(true),
                include_entry_fields: None,
                include_sense_fields: None,
            },
        )
        .unwrap();

        assert_eq!(result["summary"]["entries_added"], 1);
        assert_eq!(result["summary"]["entries_removed"], 1);
        assert_eq!(result["summary"]["entries_modified"], 1);
        assert_eq!(result["entries"]["added"], json!(["added"]));
        assert_eq!(result["entries"]["removed"], json!(["removed"]));
        assert_eq!(result["entries"]["modified"][0]["id"], "changed");
        assert_eq!(
            result["entries"]["modified"][0]["senses"]["added"],
            json!(["s_added"])
        );
        assert_eq!(
            result["entries"]["modified"][0]["senses"]["removed"],
            json!(["s_removed"])
        );
    }
}
