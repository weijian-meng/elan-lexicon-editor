use serde_json::{json, Value};
use thiserror::Error;

pub const ATTR_PREFIX: &str = "$";
pub const TEXT_KEY: &str = "_";
pub const DEFAULT_SCHEMA_VERSION: &str = "1.0";
pub const DEFAULT_PRODUCER: &str = "ELAN Lexicon Component";
pub const DEFAULT_SCHEMA_LOCATION: &str = "http://www.mpi.nl/tools/elan/LexiconComponent-1.0.xsd";
pub const XMLNS_XSI: &str = "http://www.w3.org/2001/XMLSchema-instance";

pub const FORCED_LISTS: &[&str] = &[
    "header",
    "entry",
    "variant",
    "sense",
    "author",
    "field-spec",
    "custom-fields",
    "field-configs",
    "lexical-unit",
    "morph-type",
    "citation",
    "phonetic",
    "grammatical-category",
    "gloss",
    "definition",
    "field",
    "name",
    "language",
    "version",
    "description",
];

#[derive(Error, Debug)]
pub enum XmlError {
    #[error("XML parsing error: {0}")]
    Parse(#[from] quick_xml::Error),
    #[error("Attribute parsing error: {0}")]
    Attr(#[from] quick_xml::events::attributes::AttrError),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("UTF-8 error: {0}")]
    FromUtf8(#[from] std::string::FromUtf8Error),
    #[error("UTF-8 str error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("Structure error: {0}")]
    Structure(String),
}

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
pub struct DiffOptions {
    pub ignore_timestamps: Option<bool>,
    pub include_entry_fields: Option<Vec<String>>,
    pub include_sense_fields: Option<Vec<String>>,
}

pub fn new_lexicon(name: &str, language: &str) -> Value {
    let name = non_empty_or_default(name, "New Lexicon");
    let language = non_empty_or_default(language, "en");

    json!({
        ATTR_PREFIX: {
            "xmlns:xsi": XMLNS_XSI,
            "schemaVersion": DEFAULT_SCHEMA_VERSION,
            "producer": DEFAULT_PRODUCER,
            "xsi:schemaLocation": DEFAULT_SCHEMA_LOCATION
        },
        "header": [{
            "name": [name],
            "language": [language]
        }],
        "entry": []
    })
}

fn non_empty_or_default<'a>(value: &'a str, default: &'a str) -> &'a str {
    let value = value.trim();
    if value.is_empty() {
        default
    } else {
        value
    }
}

pub fn attr_value(value: &Value, name: &str) -> String {
    value
        .get(ATTR_PREFIX)
        .and_then(|attrs| attrs.get(name))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_default()
}

pub fn entry_id(entry: &Value) -> String {
    let id = attr_value(entry, "id");
    if !id.is_empty() {
        return id;
    }

    first_text(entry.get("lexical-unit")).unwrap_or_default()
}

pub fn sense_id(sense: &Value) -> String {
    let id = attr_value(sense, "id");
    if !id.is_empty() {
        return id;
    }

    attr_value(sense, "order")
}

pub fn first_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Array(items) => items.first().and_then(text_value),
        other => text_value(other),
    }
}

pub fn text_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Object(map) => map.get(TEXT_KEY).and_then(text_value),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::{build_xml, parse_xml};

    #[test]
    fn new_lexicon_matches_template_compatible_shape() {
        let lexicon = new_lexicon("Test Lexicon", "xla");

        assert_eq!(lexicon["$"]["schemaVersion"], DEFAULT_SCHEMA_VERSION);
        assert_eq!(lexicon["$"]["producer"], DEFAULT_PRODUCER);
        assert_eq!(lexicon["header"][0]["name"][0], "Test Lexicon");
        assert_eq!(lexicon["header"][0]["language"][0], "xla");
        assert_eq!(lexicon["entry"].as_array().unwrap().len(), 0);

        let xml = build_xml(&json!({ "lexicon": lexicon })).unwrap();
        let parsed = parse_xml(&xml).unwrap();
        assert_eq!(parsed["lexicon"]["header"][0]["name"][0], "Test Lexicon");
        assert_eq!(parsed["lexicon"]["header"][0]["language"][0], "xla");
    }

    #[test]
    fn new_lexicon_defaults_empty_inputs() {
        let lexicon = new_lexicon("  ", "");
        assert_eq!(lexicon["header"][0]["name"][0], "New Lexicon");
        assert_eq!(lexicon["header"][0]["language"][0], "en");
    }
}
