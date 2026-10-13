use serde_json::Value;

use super::model::{attr_value, entry_id, ATTR_PREFIX};

pub fn canonicalize_lexicon(lexicon: Value, ignore_timestamps: bool) -> Result<Value, String> {
    let mut lexicon = lexicon;
    if let Value::Object(ref mut map) = lexicon {
        if let Some(Value::Array(entries)) = map.get_mut("entry") {
            let mut normalized = Vec::new();
            for entry in entries.iter() {
                normalized.push(normalize_entry(entry.clone(), ignore_timestamps));
            }
            normalized.sort_by_key(entry_id);
            *entries = normalized;
        }
    }
    Ok(lexicon)
}

fn normalize_entry(mut entry: Value, ignore_timestamps: bool) -> Value {
    if let Value::Object(ref mut map) = entry {
        if ignore_timestamps {
            if let Some(Value::Object(attrs)) = map.get_mut(ATTR_PREFIX) {
                attrs.remove("dateModified");
            }
        }

        for key in &["lexical-unit", "morph-type"] {
            if let Some(value) = map.get_mut(*key) {
                *value = ensure_list_first_str(value);
            }
        }

        if let Some(variants) = map.get_mut("variant") {
            *variants = sorted_variants(variants);
        }

        if let Some(senses) = map.get_mut("sense") {
            *senses = sorted_senses(senses);
        }
    }
    entry
}

fn ensure_list_first_str(value: &mut Value) -> Value {
    match value {
        Value::Array(_) => value.clone(),
        _ => Value::Array(vec![value.clone()]),
    }
}

fn sorted_variants(value: &Value) -> Value {
    let mut items = match value {
        Value::Array(values) => values.clone(),
        Value::Null => Vec::new(),
        other => vec![other.clone()],
    };
    items.retain(|v| v != "");
    items.sort_by_key(Value::to_string);
    Value::Array(items)
}

fn sorted_senses(value: &Value) -> Value {
    let mut items = if let Value::Array(values) = value {
        values.clone()
    } else {
        Vec::new()
    };

    items.sort_by(|a, b| {
        let order_a = attr_value(a, "order");
        let id_a = attr_value(a, "id");
        let order_b = attr_value(b, "order");
        let id_b = attr_value(b, "id");
        (order_a, id_a).cmp(&(order_b, id_b))
    });

    for sense in &mut items {
        if let Value::Object(map) = sense {
            for key in &["grammatical-category", "gloss"] {
                if let Some(value) = map.get_mut(*key) {
                    *value = ensure_list_first_str(value);
                }
            }
        }
    }

    Value::Array(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonicalization_strips_date_modified_and_sorts_entries() {
        let lexicon = json!({
            "entry": [
                {"$": {"id": "b", "dateModified": "2026-01-02"}, "lexical-unit": "bee"},
                {"$": {"id": "a", "dateModified": "2026-01-01"}, "lexical-unit": "aye"}
            ]
        });

        let normalized = canonicalize_lexicon(lexicon, true).unwrap();
        let entries = normalized["entry"].as_array().unwrap();

        assert_eq!(entries[0]["$"]["id"], "a");
        assert_eq!(entries[1]["$"]["id"], "b");
        assert!(entries[0]["$"].get("dateModified").is_none());
        assert!(entries[1]["$"].get("dateModified").is_none());
    }

    #[test]
    fn canonicalization_sorts_senses_and_variants() {
        let lexicon = json!({
            "entry": [{
                "$": {"id": "e1"},
                "lexical-unit": "foo",
                "variant": ["z", "a", ""],
                "sense": [
                    {"$": {"id": "s2", "order": "2"}, "grammatical-category": "v", "gloss": "do"},
                    {"$": {"id": "s1", "order": "1"}, "grammatical-category": "n", "gloss": "thing"}
                ]
            }]
        });

        let normalized = canonicalize_lexicon(lexicon, true).unwrap();
        let entry = &normalized["entry"][0];
        assert_eq!(entry["variant"], json!(["a", "z"]));
        assert_eq!(entry["sense"][0]["$"]["id"], "s1");
        assert_eq!(entry["sense"][1]["$"]["id"], "s2");
        assert_eq!(entry["sense"][0]["gloss"], json!(["thing"]));
    }
}
