use serde_json::Value;

use super::model::{ATTR_PREFIX, TEXT_KEY};

pub fn validate_lexicon_document(document: &Value) -> Result<(), String> {
    let lexicon = document
        .get("lexicon")
        .ok_or_else(|| "Missing lexicon root".to_string())?;
    validate_lexicon(lexicon)
}

pub fn validate_lexicon(lexicon: &Value) -> Result<(), String> {
    let Some(map) = lexicon.as_object() else {
        return Err("lexicon must be an object".to_string());
    };

    match map.get("header") {
        Some(Value::Array(headers)) if !headers.is_empty() => {}
        Some(_) => return Err("header must be a non-empty array".to_string()),
        None => return Err("Missing header".to_string()),
    }

    if let Some(entries) = map.get("entry") {
        let Some(entries) = entries.as_array() else {
            return Err("entry must be an array".to_string());
        };
        for entry in entries {
            validate_entry(entry)?;
        }
    }

    Ok(())
}

pub fn validate_entry(entry: &Value) -> Result<(), String> {
    let Some(map) = entry.as_object() else {
        return Err("entry must be an object".to_string());
    };

    match map.get(ATTR_PREFIX).and_then(|attrs| attrs.get("id")) {
        Some(Value::String(id)) if !id.is_empty() => {}
        _ => return Err("entry must have a non-empty id attribute".to_string()),
    }

    if !has_text_list_item(map.get("lexical-unit")) {
        return Err("entry must have lexical-unit text".to_string());
    }

    if let Some(senses) = map.get("sense") {
        let Some(senses) = senses.as_array() else {
            return Err("sense must be an array".to_string());
        };
        for sense in senses {
            validate_sense(sense)?;
        }
    }

    Ok(())
}

pub fn validate_sense(sense: &Value) -> Result<(), String> {
    let Some(map) = sense.as_object() else {
        return Err("sense must be an object".to_string());
    };

    let attrs = map
        .get(ATTR_PREFIX)
        .and_then(|attrs| attrs.as_object())
        .ok_or_else(|| "sense must have attributes".to_string())?;

    match attrs.get("id") {
        Some(Value::String(id)) if !id.is_empty() => {}
        _ => return Err("sense must have a non-empty id attribute".to_string()),
    }

    match attrs.get("order") {
        Some(Value::String(order)) if !order.is_empty() => {}
        _ => return Err("sense must have a non-empty order attribute".to_string()),
    }

    if !has_text_list_item(map.get("grammatical-category")) {
        return Err("sense must have grammatical-category text".to_string());
    }

    if !has_text_list_item(map.get("gloss")) {
        return Err("sense must have gloss text".to_string());
    }

    Ok(())
}

fn has_text_list_item(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };

    let first = match value {
        Value::Array(items) => items.first(),
        value => Some(value),
    };

    match first {
        Some(Value::String(text)) => !text.is_empty(),
        Some(Value::Object(map)) => map
            .get(TEXT_KEY)
            .and_then(|value| value.as_str())
            .map(|text| !text.is_empty())
            .unwrap_or(false),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::parse_xml;

    #[test]
    fn accepts_representative_lexicon_shape() {
        let xml = r#"<lexicon><header><name>n</name><language>x</language></header><entry id="e1"><lexical-unit>foo</lexical-unit><sense id="s1" order="1"><grammatical-category>n</grammatical-category><gloss>foo</gloss></sense></entry></lexicon>"#;
        let parsed = parse_xml(xml).unwrap();
        validate_lexicon_document(&parsed).unwrap();
    }

    #[test]
    fn rejects_missing_entry_id() {
        let xml = r#"<lexicon><header><name>n</name><language>x</language></header><entry><lexical-unit>foo</lexical-unit><sense id="s1" order="1"><grammatical-category>n</grammatical-category><gloss>foo</gloss></sense></entry></lexicon>"#;
        let parsed = parse_xml(xml).unwrap();
        let err = validate_lexicon_document(&parsed).unwrap_err();
        assert!(err.contains("entry"));
    }
}
