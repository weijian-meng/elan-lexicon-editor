use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde_json::{Map, Value};
use std::collections::HashSet;

use super::model::{XmlError, ATTR_PREFIX, FORCED_LISTS, TEXT_KEY};

pub fn parse_xml(xml_content: &str) -> Result<Value, XmlError> {
    let mut reader = Reader::from_str(xml_content);
    reader.trim_text(false);
    reader.expand_empty_elements(true);

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
                let text = e.unescape().map_err(XmlError::Parse)?.to_string();
                if let Some(current) = stack.last_mut() {
                    current.text = Some(match &current.text {
                        Some(existing) => existing.clone() + &text,
                        None => text,
                    });
                }
            }
            Ok(Event::CData(e)) => {
                let text = std::str::from_utf8(e.as_ref())?.to_string();
                if let Some(current) = stack.last_mut() {
                    current.text = Some(match &current.text {
                        Some(existing) => existing.clone() + &text,
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

                    let has_attrs = !completed.attrs.is_empty();
                    let has_children = !completed.children.is_empty();
                    // Preserve field text exactly; indentation around child elements is structural.
                    let raw_text = completed.text.as_deref().unwrap_or("");
                    let raw_text = if has_children {
                        raw_text.trim()
                    } else {
                        raw_text
                    };
                    let has_text = !raw_text.is_empty();
                    let text_val = raw_text.to_string();

                    let val = if !has_attrs && !has_children && has_text {
                        Value::String(text_val)
                    } else if !has_attrs && !has_children && !has_text {
                        Value::Null
                    } else {
                        let mut obj = Map::new();
                        if has_attrs {
                            obj.insert(ATTR_PREFIX.to_string(), Value::Object(completed.attrs));
                        }
                        if has_children {
                            for (key, value) in completed.children {
                                obj.insert(key, value);
                            }
                        }
                        if has_text {
                            obj.insert(TEXT_KEY.to_string(), Value::String(text_val));
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
        if let Value::Array(items) = existing {
            items.push(value);
        } else {
            let prev = existing.clone();
            *existing = Value::Array(vec![prev, value]);
        }
    } else if is_forced {
        map.insert(name.to_string(), Value::Array(vec![value]));
    } else {
        map.insert(name.to_string(), value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_simple_element() {
        let res = parse_xml("<root>hello</root>").unwrap();
        assert_eq!(res, json!({"root": "hello"}));
    }

    #[test]
    fn parses_attributes_and_text_key() {
        let res = parse_xml(r#"<root id="1">hello</root>"#).unwrap();
        assert_eq!(
            res,
            json!({
                "root": {
                    "$": { "id": "1" },
                    "_": "hello"
                }
            })
        );
    }

    #[test]
    fn parses_forced_lists() {
        let xml = "<lexicon><entry><lexical-unit>foo</lexical-unit></entry></lexicon>";
        let res = parse_xml(xml).unwrap();
        assert_eq!(
            res,
            json!({
                "lexicon": {
                    "entry": [
                        {
                            "lexical-unit": ["foo"]
                        }
                    ]
                }
            })
        );
    }

    #[test]
    fn parses_empty_element() {
        let res = parse_xml("<root><empty/></root>").unwrap();
        assert_eq!(res, json!({"root": {"empty": null}}));
    }

    #[test]
    fn parses_elan_template_header_and_root_attributes() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<lexicon xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" schemaVersion="1.0" producer="ELAN Lexicon Component" xsi:schemaLocation="http://www.mpi.nl/tools/elan/LexiconComponent-1.0.xsd">
    <header>
        <name>lexicon name</name>
        <language>language</language>
    </header>
</lexicon>"#;
        let res = parse_xml(xml).unwrap();
        let lexicon = res.get("lexicon").unwrap();
        assert_eq!(lexicon["$"]["schemaVersion"], "1.0");
        assert_eq!(lexicon["$"]["producer"], "ELAN Lexicon Component");
        assert_eq!(lexicon["header"][0]["name"], json!(["lexicon name"]));
        assert_eq!(lexicon["header"][0]["language"], json!(["language"]));
    }

    #[test]
    fn preserves_text_plus_attribute_fields() {
        let xml = r#"<lexicon><entry id="e1"><lexical-unit>foo</lexical-unit><phonetic lang="ipa">fu</phonetic><sense id="s1" order="1"><grammatical-category>n</grammatical-category><gloss lang="en">foo</gloss><definition lang="en">a foo</definition><field name="domain">test</field></sense></entry></lexicon>"#;
        let res = parse_xml(xml).unwrap();
        let entry = &res["lexicon"]["entry"][0];
        assert_eq!(
            entry["phonetic"][0],
            json!({"$": {"lang": "ipa"}, "_": "fu"})
        );
        let sense = &entry["sense"][0];
        assert_eq!(sense["gloss"][0], json!({"$": {"lang": "en"}, "_": "foo"}));
        assert_eq!(
            sense["definition"][0],
            json!({"$": {"lang": "en"}, "_": "a foo"})
        );
        assert_eq!(
            sense["field"][0],
            json!({"$": {"name": "domain"}, "_": "test"})
        );
    }
}
