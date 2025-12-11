use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::io::Cursor;
use thiserror::Error;

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

const FORCED_LISTS: &[&str] = &[
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

const ATTR_PREFIX: &str = "$";
const CDATA_KEY: &str = "_";

pub fn parse_xml(xml_content: &str) -> Result<Value, XmlError> {
    let mut reader = Reader::from_str(xml_content);
    reader.trim_text(true);
    reader.expand_empty_elements(true);

    // Stack items: (Name, Attributes map, Children map, Text content)
    #[derive(Debug)]
    struct StackItem {
        name: String,
        attrs: Map<String, Value>,
        children: Map<String, Value>,
        text: Option<String>,
    }

    let mut stack: Vec<StackItem> = Vec::new();
    let mut root_values: Map<String, Value> = Map::new();
    let forced_lists: HashSet<&str> = FORCED_LISTS.iter().copied().collect();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())?.to_string();
                let mut attrs = Map::new();
                for attr in e.attributes() {
                    let attr = attr?;
                    let key = std::str::from_utf8(attr.key.as_ref())?.to_string();
                    let val = std::str::from_utf8(attr.value.as_ref())?.to_string();
                    attrs.insert(key, Value::String(val));
                }
                stack.push(StackItem {
                    name,
                    attrs,
                    children: Map::new(),
                    text: None,
                });
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().map_err(|err| XmlError::Parse(err))?.to_string();
                if let Some(current) = stack.last_mut() {
                    current.text = Some(match &current.text {
                        Some(t) => t.clone() + &text,
                        None => text,
                    });
                }
            }
            Ok(Event::CData(e)) => {
                let text = std::str::from_utf8(e.as_ref())?.to_string();
                if let Some(current) = stack.last_mut() {
                    current.text = Some(match &current.text {
                        Some(t) => t.clone() + &text,
                        None => text,
                    });
                }
            }
            Ok(Event::End(e)) => {
                let end_name = std::str::from_utf8(e.name().as_ref())?.to_string();
                if let Some(completed) = stack.pop() {
                    if completed.name != end_name {
                        return Err(XmlError::Structure(format!(
                            "Mismatched tag: expected {}, got {}",
                            completed.name, end_name
                        )));
                    }

                    let mut obj = Map::new();
                    let has_attrs = !completed.attrs.is_empty();
                    let has_children = !completed.children.is_empty();
                    let raw_text = completed.text.as_ref().map(|s| s.trim()).unwrap_or("");
                    let has_text = !raw_text.is_empty();
                    let text_val = raw_text.to_string();

                    let val = if !has_attrs && !has_children && has_text {
                        Value::String(text_val)
                    } else if !has_attrs && !has_children && !has_text {
                        Value::Null 
                    } else {
                        if has_attrs {
                            obj.insert(ATTR_PREFIX.to_string(), Value::Object(completed.attrs));
                        }
                        if has_children {
                            for (k, v) in completed.children {
                                obj.insert(k, v);
                            }
                        }
                        if has_text {
                             obj.insert(CDATA_KEY.to_string(), Value::String(text_val));
                        }
                        Value::Object(obj)
                    };

                    if let Some(parent) = stack.last_mut() {
                        add_child(&mut parent.children, &completed.name, val, &forced_lists);
                    } else {
                        add_child(&mut root_values, &completed.name, val, &forced_lists);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.into()),
            _ => (),
        }
    }

    Ok(Value::Object(root_values))
}

fn add_child(map: &mut Map<String, Value>, name: &str, value: Value, forced_lists: &HashSet<&str>) {
    let is_forced = forced_lists.contains(name);
    
    if let Some(existing) = map.get_mut(name) {
        if let Value::Array(arr) = existing {
            arr.push(value);
        } else {
            let prev = existing.clone();
            *existing = Value::Array(vec![prev, value]);
        }
    } else {
        if is_forced {
            map.insert(name.to_string(), Value::Array(vec![value]));
        } else {
            map.insert(name.to_string(), value);
        }
    }
}

pub fn build_xml(json: &Value) -> Result<String, XmlError> {
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 4);
    
    match json {
        Value::Object(map) => {
            if map.len() == 1 {
                let (root_name, root_val) = map.iter().next().unwrap();
                write_element(&mut writer, root_name, root_val)?;
            } else {
                return Err(XmlError::Structure("Root object must have exactly one key".into()));
            }
        }
        _ => return Err(XmlError::Structure("Root must be an object".into())),
    }

    let result = writer.into_inner().into_inner();
    let s = String::from_utf8(result)?;
    
    let decl = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";
    Ok(format!("{}\n{}", decl, s))
}

fn get_child_order(name: &str) -> Option<&'static [&'static str]> {
    match name {
        "lexicon" => Some(&["header", "entry"]),
        "header" => Some(&[
            "name",
            "language",
            "description",
            "author",
            "version",
            "custom-fields",
            "field-configs",
            "sort-order",
        ]),
        "entry" => Some(&[
            "lexical-unit",
            "citation",
            "morph-type",
            "variant",
            "phonetic",
            "note",
            "field",
            "sense",
        ]),
        "sense" => Some(&[
            "grammatical-category",
            "gloss",
            "definition",
            "example",
            "comment",
            "internal-note",
            "field",
        ]),
        "example" => Some(&["text", "translation", "source-ref", "fragment-ref"]),
        _ => None,
    }
}

fn write_element<W: std::io::Write>(writer: &mut Writer<W>, name: &str, value: &Value) -> Result<(), XmlError> {
    if name == ATTR_PREFIX || name == CDATA_KEY {
        return Ok(());
    }

    match value {
        Value::Array(arr) => {
            for item in arr {
                write_element(writer, name, item)?;
            }
        }
        Value::Object(map) => {
            let mut elem = BytesStart::new(name);
            
            if let Some(attrs) = map.get(ATTR_PREFIX) {
                if let Value::Object(attr_map) = attrs {
                    for (k, v) in attr_map {
                        if let Value::String(s) = v {
                            elem.push_attribute((k.as_str(), s.as_str()));
                        }
                    }
                }
            }

            if map.contains_key(CDATA_KEY) || map.iter().any(|(k, _)| k != ATTR_PREFIX && k != CDATA_KEY) || map.is_empty() {
                 writer.write_event(Event::Start(elem.borrow()))?;
                 
                 if let Some(Value::String(text)) = map.get(CDATA_KEY) {
                     writer.write_event(Event::Text(BytesText::new(text)))?;
                 }
                 
                 let order = get_child_order(name);
                 let mut written_keys = HashSet::new();

                 if let Some(keys) = order {
                     for key in keys {
                         if let Some(val) = map.get(*key) {
                             write_element(writer, key, val)?;
                             written_keys.insert(key.to_string());
                         }
                     }
                 }

                 for (k, v) in map {
                     if k != ATTR_PREFIX && k != CDATA_KEY && !written_keys.contains(k) {
                         write_element(writer, k, v)?;
                     }
                 }
                 
                 writer.write_event(Event::End(BytesEnd::new(name)))?;
            } else {
                writer.write_event(Event::Empty(elem))?;
            }
        }
        Value::String(s) => {
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::new(s)))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
        Value::Null => {
             let elem = BytesStart::new(name);
             writer.write_event(Event::Empty(elem))?;
        }
        _ => {
            let s = if let Value::String(str_val) = value { str_val.clone() } else { value.to_string() };
            
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::new(&s)))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_element() {
        let xml = "<root>hello</root>";
        let res = parse_xml(xml).unwrap();
        assert_eq!(res, json!({"root": "hello"}));
        
        let build = build_xml(&res).unwrap();
        assert!(build.contains("<root>hello</root>"));
    }

    #[test]
    fn test_attributes() {
        let xml = r#"<root id="1">hello</root>"#;
        let res = parse_xml(xml).unwrap();
        assert_eq!(res, json!({
            "root": {
                "$": { "id": "1" },
                "_": "hello"
            }
        }));
    }

    #[test]
    fn test_forced_list() {
        let xml = "<lexicon><entry><lexical-unit>foo</lexical-unit></entry></lexicon>";
        let res = parse_xml(xml).unwrap();
        assert_eq!(res, json!({
            "lexicon": {
                "entry": [
                    {
                        "lexical-unit": ["foo"]
                    }
                ]
            }
        }));
    }
    
    #[test]
    fn test_mixed_forced_list_multiple() {
        let xml = "<lexicon><entry>A</entry><entry>B</entry></lexicon>";
        let res = parse_xml(xml).unwrap();
        assert_eq!(res, json!({
            "lexicon": {
                "entry": ["A", "B"]
            }
        }));
    }

    #[test]
    fn test_empty_element() {
        let xml = "<root><empty/></root>";
        let res = parse_xml(xml).unwrap();
        assert_eq!(res, json!({"root": {"empty": null}}));
    }

    #[test]
    fn test_formatted_xml() {
        let json = json!({
            "root": {
                "child": {
                    "_": "text"
                }
            }
        });
        let build = build_xml(&json).unwrap();
        // Check for newlines and indentation
        assert!(build.contains("\n    <child>"));
    }

    #[test]
    fn test_ordering() {
        // "sense" children order: grammatical-category, gloss, definition...
        // Alphabetical: definition, gloss, grammatical-category
        // We want strict order.
        let json = json!({
            "sense": {
                "definition": "def",
                "grammatical-category": "cat",
                "gloss": "gloss"
            }
        });
        
        let build = build_xml(&json).unwrap();
        
        let grammar_pos = build.find("<grammatical-category>").unwrap();
        let gloss_pos = build.find("<gloss>").unwrap();
        let def_pos = build.find("<definition>").unwrap();
        
        // Expected: cat < gloss < def
        assert!(grammar_pos < gloss_pos, "grammatical-category should be before gloss");
        assert!(gloss_pos < def_pos, "gloss should be before definition");
    }
}
