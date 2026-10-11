import CustomerEstimatePage from "./CustomerEstimatePage";
import CompanyHomepageContent from "./CompanyHomepageContent";
import { loadCustomerHomepage } from "../../lib/loadCustomerHomepage";

export default async function CustomerHomepage({ slug }) {
  let homepage = null;

  try {
    homepage = await loadCustomerHomepage(slug);
  } catch (error) {
    console.error(
      "Customer homepage lookup failed",
      error?.message
    );
  }

  return (
    <CustomerEstimatePage
      companySlug={slug}
      initialCompany={homepage?.company || null}
      initialSettings={homepage?.settings || null}
      publicProfile={homepage?.profile || null}
      homepageContent={
        <CompanyHomepageContent homepage={homepage} />
      }
    />
  );
}
