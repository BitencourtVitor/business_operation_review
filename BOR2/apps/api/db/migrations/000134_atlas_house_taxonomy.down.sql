DELETE FROM atlas_doc_category
WHERE build_type IN ('lot', 'house')
  AND name IN ('Plot Plan', 'Option Summary', 'AOS Diagrams', 'Panels Plan',
               'Wall Details', 'Trusses', 'SPF');
