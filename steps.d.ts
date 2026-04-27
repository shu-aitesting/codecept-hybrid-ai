/// <reference types='codeceptjs' />
type steps_file = typeof import('./steps_file');
type headerFragment = typeof import('./src/ui/fragments/common/HeaderFragment');
type modalFragment = typeof import('./src/ui/fragments/common/ModalFragment');
type navbarFragment = typeof import('./src/ui/fragments/common/NavbarFragment');
type loginForm = typeof import('./src/ui/fragments/features/LoginFormFragment');
type loginPage = typeof import('./src/ui/pages/LoginPage');
type dashboardPage = typeof import('./src/ui/pages/DashboardPage');
type authSteps = typeof import('./src/ui/steps/AuthSteps');
type RestHelper = import('./src/core/helpers/RestHelper');
type VisualHelper = import('./src/core/helpers/VisualHelper');
type ExpectHelper = import('@codeceptjs/expect-helper');
type FileSystem = import('codeceptjs/lib/helper/FileSystem');
type CustomSteps = import('./src/types/custom-steps').CustomSteps;

declare namespace CodeceptJS {
  interface SupportObject {
    I: I;
    current: any;
    headerFragment: headerFragment;
    modalFragment: modalFragment;
    navbarFragment: navbarFragment;
    loginForm: loginForm;
    loginPage: loginPage;
    dashboardPage: dashboardPage;
    authSteps: authSteps;
  }
  interface Methods extends Playwright, REST, RestHelper, VisualHelper, ExpectHelper, FileSystem {}
  interface I extends ReturnType<steps_file>, WithTranslation<Methods>, CustomSteps {}
  namespace Translation {
    interface Actions {}
  }
}
