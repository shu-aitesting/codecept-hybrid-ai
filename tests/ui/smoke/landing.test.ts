import { LandingPage } from '@ui/pages/LandingPage';

const landingPage = new LandingPage();

Feature('Landing Page').tag('@ui').tag('@smoke');

Scenario('User can navigate to key sections @smoke', async ({ I }) => {
  await landingPage.open();
  I.seeElement(landingPage.landing.selectors.howItWorksLink);
  I.seeElement(landingPage.landing.selectors.brandsLink);
  I.seeElement(landingPage.landing.selectors.productsLink);
  I.click(landingPage.landing.selectors.brandsLink);
  I.seeInCurrentUrl('/brands');
});

Scenario('Carousel navigation works @functional', async ({ I }) => {
  await landingPage.open();
  I.seeElement(landingPage.landing.selectors.carouselNextButton);
  await landingPage.landing.clickCarouselNext();
  I.seeElement(landingPage.landing.selectors.carouselPrevButton);
  await landingPage.landing.clickCarouselPrev();
});

Scenario('Video mute/unmute toggle @ui', async ({ I }) => {
  await landingPage.open();
  I.seeElement(landingPage.landing.selectors.videoMuteButton);
  await landingPage.landing.toggleVideoMute();
  I.seeElement('[aria-label="Mute video"]');
});
