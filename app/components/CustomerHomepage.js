import CustomerDesignHero from "./CustomerDesignHero";
import CustomerChat from "./CustomerChat";
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
    <>
    <CustomerEstimatePage
      companySlug={slug}
      initialCompany={homepage?.company || null}
      initialSettings={homepage?.settings || null}
      publicProfile={homepage?.profile || null}
      brandHero={homepage?.profile ? <CustomerDesignHero designId={homepage.profile.design_id} name={homepage.profile.business_name || homepage.company.company_name} introduction={homepage.profile.introduction} region={homepage.profile.regions} image={homepage.cases?.[0]?.after?.[0]} logo={homepage.company.logo_url} /> : null}
      homepageContent={
        <CompanyHomepageContent homepage={homepage} />
      }
    />
    {homepage?.company && <CustomerChat slug={slug} companyName={homepage.company.company_name} />}
    </>
  );
}
