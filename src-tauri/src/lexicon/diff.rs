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
        "modified": modified
    }))
}

fn diff_entry_fields(left: &Value, right: &Value, _opts: &DiffOptions) -> Vec<Value> {
    let mut changes = Vec::new();
    let Some(left_map) = left.as_object() else {
        return changes;
    };
    let Some(right_map) = right.as_object() else {
        return changes;
    };

    let keys: HashSet<_> = left_map
        .keys()
        .chain(right_map.keys())
        .filter(|key| *key != "sense" && *key != "$")
        .collect();

    for key in keys {
        let before = first_text(left_map.get(key)).unwrap_or_default();
        let after = first_text(right_map.get(key)).unwrap_or_default();
        if before != after {
            changes.push(serde_json::json!({
                "kind": "field",
                "name": key,
                "before": before,
                "after": after
            }));
        }
    }

    changes
}

fn diff_entry_senses(left: &Value, right: &Value, _opts: &DiffOptions) -> Value {
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

        let Some(left_map) = left_item.as_object() else {
            continue;
        };
        let Some(right_map) = right_item.as_object() else {
            continue;
        };

        let field_keys: HashSet<_> = left_map
            .keys()
            .chain(right_map.keys())
            .filter(|key| *key != "$")
            .collect();
        let mut sense_changes = Vec::new();

        for field_key in field_keys {
            let before = first_text(left_map.get(field_key)).unwrap_or_default();
            let after = first_text(right_map.get(field_key)).unwrap_or_default();
            if before != after {
                sense_changes.push(serde_json::json!({
                    "kind": "field",
                    "name": field_key,
                    "before": before,
                    "after": after
                }));
            }
        }

        if !sense_changes.is_empty() {
            modified.push(serde_json::json!({
                "id": key,
                "changes": sense_changes
            }));
        }
    }

    serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified,
        "reordered": false
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
