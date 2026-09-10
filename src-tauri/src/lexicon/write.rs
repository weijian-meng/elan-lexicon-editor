use quick_xml::escape::partial_escape;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::writer::Writer;
use serde_json::Value;
use std::collections::HashSet;
use std::io::Cursor;

use super::model::{XmlError, ATTR_PREFIX, DEFAULT_SCHEMA_LOCATION, TEXT_KEY, XMLNS_XSI};

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
    Ok(format!("{}\n{}\n", decl, xml))
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
                let mut attr_map = attr_map.clone();
                // Repair the legacy single-URL schema hint for namespace-free ELAN files.
                if name == "lexicon"
                    && attr_map.get("xmlns:xsi").and_then(Value::as_str) == Some(XMLNS_XSI)
                    && attr_map
                        .get("xmlns")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .is_empty()
                    && attr_map.get("xsi:schemaLocation").and_then(Value::as_str)
                        == Some(DEFAULT_SCHEMA_LOCATION)
                {
                    attr_map.remove("xsi:schemaLocation");
                    attr_map
                        .entry("xsi:noNamespaceSchemaLocation".to_string())
                        .or_insert_with(|| Value::String(DEFAULT_SCHEMA_LOCATION.to_string()));
                }
                // Match ELAN's attribute order for entries and declarations.
                let preferred: &[&str] = match name {
                    "entry" => &["id", "dateCreated", "dateModified"],
                    "field-spec" => &["name", "level"],
                    _ => &[],
                };
                let mut attributes: Vec<_> = attr_map.iter().collect();
                attributes.sort_by_key(|(key, _)| {
                    preferred
                        .iter()
                        .position(|name| *name == key.as_str())
                        .unwrap_or(preferred.len())
                });
                for (key, value) in attributes {
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
                    writer
                        .write_event(Event::Text(BytesText::from_escaped(partial_escape(text))))?;
                } else if map.is_empty() {
                    writer.write_event(Event::Text(BytesText::new("")))?;
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
                write_empty_element(writer, elem)?;
            }
        }
        Value::String(text) => {
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::from_escaped(partial_escape(text))))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
        Value::Null => {
            let elem = BytesStart::new(name);
            write_empty_element(writer, elem)?;
        }
        _ => {
            let text = value.to_string();
            let elem = BytesStart::new(name);
            writer.write_event(Event::Start(elem.borrow()))?;
            writer.write_event(Event::Text(BytesText::from_escaped(partial_escape(&text))))?;
            writer.write_event(Event::End(BytesEnd::new(name)))?;
        }
    }

    Ok(())
}

// Empty text prevents the indenter from inserting a newline between the tags.
// Parsed empty values and UI-created empty strings must serialize identically.
fn write_empty_element<W: std::io::Write>(
    writer: &mut Writer<W>,
    elem: BytesStart<'_>,
) -> Result<(), XmlError> {
    writer.write_event(Event::Start(elem.borrow()))?;
    writer.write_event(Event::Text(BytesText::new("")))?;
    writer.write_event(Event::End(elem.to_end()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::parse_xml;
    use serde_json::json;

    #[test]
    fn repairs_legacy_schema_hint_without_mutating_input() {
        let input = json!({"lexicon": {"$": {
            "xmlns:xsi": XMLNS_XSI,
            "xsi:schemaLocation": DEFAULT_SCHEMA_LOCATION
        }}});
        let xml = build_xml(&input).unwrap();
        assert!(xml.contains("xsi:noNamespaceSchemaLocation="));
        assert!(!xml.contains("xsi:schemaLocation="));
        assert!(input["lexicon"]["$"]["xsi:schemaLocation"].is_string());
        assert!(xml.ends_with("\n"));
        assert!(!xml.ends_with("\n\n"));
        assert_eq!(build_xml(&parse_xml(&xml).unwrap()).unwrap(), xml);
        let new = crate::lexicon::new_lexicon("test", "grv");
        assert_eq!(
            new["$"]["xsi:noNamespaceSchemaLocation"],
            DEFAULT_SCHEMA_LOCATION
        );
    }

    #[test]
    fn preserves_other_schema_hints() {
        let input = json!({"lexicon": {"$": {
            "xmlns:xsi": XMLNS_XSI,
            "xmlns": "urn:other",
            "xsi:schemaLocation": "urn:other other.xsd"
        }}});
        assert_eq!(parse_xml(&build_xml(&input).unwrap()).unwrap(), input);
    }

    #[test]
    fn preserves_quotes_and_whitespace_while_escaping_xml_text() {
        let text = "  different from 'finish'? \"yes\" & <no>  ";
        for value in [json!(text), json!({"$": {"name": "notes"}, "_": text})] {
            let xml = build_xml(&json!({"field": value})).unwrap();
            assert!(xml.contains("'finish'? \"yes\" &amp; &lt;no&gt;  </field>"));
            let parsed = parse_xml(&xml).unwrap();
            let field = &parsed["field"][0];
            assert_eq!(field.as_str().or_else(|| field["_"].as_str()), Some(text));
        }
    }

    #[test]
    fn preserves_leaf_whitespace_without_importing_indentation() {
        let xml = "<root>\n    <note> leading <![CDATA[& middle]]> trailing </note>\n    <empty> </empty>\n</root>";
        let parsed = parse_xml(xml).unwrap();
        assert_eq!(
            parsed,
            json!({"root": {"note": " leading & middle trailing ", "empty": " "}})
        );
        assert_eq!(parse_xml(&build_xml(&parsed).unwrap()).unwrap(), parsed);
    }

    #[test]
    fn writes_empty_values_consistently() {
        for value in [Value::Null, json!(""), json!({}), json!({"_": ""})] {
            let xml = build_xml(&json!({"definition": value})).unwrap();
            assert!(xml.ends_with("<definition></definition>\n"), "{xml}");
        }
        let xml = build_xml(&json!({"field": {"$": {"name": "notes"}}})).unwrap();
        assert!(xml.ends_with("<field name=\"notes\"></field>\n"));
    }

    #[test]
    fn elan_empty_tags_and_attribute_order_survive_round_trip() {
        let xml = concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n",
            "<lexicon>\n",
            "    <header>\n",
            "        <custom-fields>\n",
            "            <field-spec name=\"language\" level=\"entry\"></field-spec>\n",
            "        </custom-fields>\n",
            "    </header>\n",
            "    <entry id=\"e1\" dateCreated=\"created\" dateModified=\"modified\">\n",
            "        <lexical-unit>tsa</lexical-unit>\n",
            "        <field name=\"language\"></field>\n",
            "        <sense id=\"s1\" order=\"1\">\n",
            "            <gloss>DIST</gloss>\n",
            "            <definition></definition>\n",
            "        </sense>\n",
            "    </entry>\n",
            "</lexicon>\n"
        );
        let mut parsed = parse_xml(xml).unwrap();
        assert_eq!(build_xml(&parsed).unwrap(), xml);
        parsed["lexicon"]["entry"][0]["field"][0]["_"] = json!("nep");
        assert_eq!(
            build_xml(&parsed).unwrap(),
            xml.replace(
                "<field name=\"language\"></field>",
                "<field name=\"language\">nep</field>"
            )
        );
    }

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
