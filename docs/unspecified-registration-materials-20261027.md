# Unspecified materials during site registration

A consultation extraction containing only `product_name: 인테리어필름` was treated as an actual planned material. The registration then required fire/non-fire selection, even though the customer had not chosen a product.

Registration now distinguishes exact generic/category labels from identified products. Generic entries without a product code or catalog identity become consultation notes, preserving the stated brand, quantity, type and memo. They create no planned stock/cost item. This normalization runs when applying either call or screenshot analysis and again at the site-save boundary. Existing saved materials are not modified.

Identified products still require explicit fire/non-fire selection and retain server-side variant validation. Missing selections identify the affected product and open the material section before final review. The review includes the selected variant. No variant is guessed or defaulted. Extraction instructions also keep generic construction categories out of material product lists.

Validation: registration normalization, real component submit flows for call and screenshot input, required variant correction, hook persistence, consultation supplementation and planned material checks. Full automated suite and production build are checked before deployment. No live consultation or customer message is created during verification.
