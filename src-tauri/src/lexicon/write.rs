use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::writer::Writer;
use serde_json::Value;
use std::collections::HashSet;
use std::io::Cursor;

use super::model::{XmlError, ATTR_PREFIX, TEXT_KEY};

pub fn build_xml(json: &Value) -> Result<String, XmlError> {
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 4);

    match json {
        Value::Object(map) => {
            if map.len() == 1 {
                let (root_name, root_val) = map.iter().next().unwrap();
                write_element(&mut writer, root_name, root_val)?;
            } else {
                return Err(XmlError::Structure(
                    "Root object must have exactly one key".into(),
                ));
            }
        }
        _ => return Err(XmlError::Structure("Root must be an object".into())),
    }

    let result = writer.into_inner().into_inner();
    let xml = String::from_utf8(result)?;

    let decl = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";
    Ok(format!("{}\n{}", decl, xml))
}

fn child_order(name: &str) -> Option<&'static [&'static str]> {
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

fn write_element<W: std::io::Write>(
    writer: &mut Writer<W>,
    name: &str,
    value: &Value,
) -> Result<(), XmlError> {
    if name == ATTR_PREFIX || name == TEXT_KEY {
        return Ok(());
    }

    match value {
        Value::Array(items) => {
            for item in items {
                write_element(writer, name, item)?;
            }
        }
        Value::Object(map) => {
            let mut elem = BytesStart::new(name);

            if let Some(Value::Object(attr_map)) = map.get(ATTR_PREFIX) {
                for (key, value) in attr_map {
                    if let Value::String(text) = value {
                        elem.push_attribute((key.as_str(), text.as_str()));
                    }
                }
            }

            if map.contains_key(TEXT_KEY)
                || map
                    .iter()
                    .any(|(key, _)| key != ATTR_PREFIX && key != TEXT_KEY)
                || map.is_empty()
            {
                writer.write_event(Event::Start(elem.borrow()))?;

                if let Some(Value::String(text)) = map.get(TEXT_KEY) {
                    writer.write_event(Event::Text(BytesText::new(text)))?;
                }

                let mut written_keys = HashSet::new();
                if let Some(keys) = child_order(name) {
                    for key in keys {
                        if let Some(value) = map.get(*key) {
                            write_element(writer, key, value)?;
                            written_keys.insert(key.to_string());
                        }
                    }
                }

                for (key, value) in map {
                    if key != ATTR_PREFIX && key != TEXT_KEY && !written_keys.contains(key) {
                        write_element(writer, key, value)?;
                    }
                }

                writer.write_event(Event::End(BytesEnd::new(name)))?;
            } else {
                writer.write_event(Event::Empty(elem))?;
            }
        }
        Value::String(text) => {
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::new(text)))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
        Value::Null => {
            let elem = BytesStart::new(name);
            writer.write_event(Event::Empty(elem))?;
        }
        _ => {
            let text = value.to_string();
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::new(&text)))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::parse_xml;
    use serde_json::json;

    #[test]
    fn writes_simple_element() {
        let build = build_xml(&json!({"root": "hello"})).unwrap();
        assert!(build.contains("<root>hello</root>"));
    }

    #[test]
    fn writes_formatted_xml() {
        let build = build_xml(&json!({"root": {"child": {"_": "text"}}})).unwrap();
        assert!(build.contains("\n    <child>"));
    }

    #[test]
    fn writes_stable_child_order() {
        let build = build_xml(&json!({
            "lexicon": {
                "entry": [{
                    "sense": [{
                        "definition": "def",
                        "grammatical-category": "cat",
                        "gloss": "gloss",
                        "example": {
                            "fragment-ref": "frag",
                            "text": "txt",
                            "translation": "trans",
                            "source-ref": "src"
                        }
                    }],
                    "morph-type": "root",
                    "lexical-unit": "foo"
                }],
                "header": {"language": "x", "name": "n"}
            }
        }))
        .unwrap();

        let header_pos = build.find("<header>").unwrap();
        let entry_pos = build.find("<entry>").unwrap();
        let lex_pos = build.find("<lexical-unit>").unwrap();
        let morph_pos = build.find("<morph-type>").unwrap();
        let grammar_pos = build.find("<grammatical-category>").unwrap();
        let gloss_pos = build.find("<gloss>").unwrap();
        let definition_pos = build.find("<definition>").unwrap();
        let text_pos = build.find("<text>").unwrap();
        let translation_pos = build.find("<translation>").unwrap();
        let source_pos = build.find("<source-ref>").unwrap();
        let fragment_pos = build.find("<fragment-ref>").unwrap();

        assert!(header_pos < entry_pos);
        assert!(lex_pos < morph_pos);
        assert!(grammar_pos < gloss_pos);
        assert!(gloss_pos < definition_pos);
        assert!(text_pos < translation_pos);
        assert!(translation_pos < source_pos);
        assert!(source_pos < fragment_pos);
    }

    #[test]
    fn round_trips_representative_xml() {
        let xml = r#"<lexicon><header><name>n</name><language>x</language></header><entry id="e1"><lexical-unit>foo</lexical-unit><variant>bar</variant><sense id="s1" order="1"><grammatical-category>n</grammatical-category><gloss lang="en">foo</gloss></sense></entry></lexicon>"#;
        let parsed = parse_xml(xml).unwrap();
        let written = build_xml(&parsed).unwrap();
        let reparsed = parse_xml(&written).unwrap();
        assert_eq!(parsed, reparsed);
    }
}
