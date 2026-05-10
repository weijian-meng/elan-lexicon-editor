use serde_json::Value;
use thiserror::Error;

pub const ATTR_PREFIX: &str = "$";
pub const TEXT_KEY: &str = "_";

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
