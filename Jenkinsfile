// Declarative Pipeline — requires Jenkins 2.387+ and the plugins listed in
// docs/JENKINS_SETUP.md: GitHub Integration, Docker Pipeline, Allure.
pipeline {
  // Every stage runs inside the official Playwright container, so browsers and
  // native libs are guaranteed present without any apt-get steps.
  agent {
    docker {
      image 'mcr.microsoft.com/playwright:v1.59.1-jammy'
      // Chromium requires /dev/shm larger than the 64 MB Docker default.
      // --ipc=host shares the host's IPC namespace and removes the limit.
      args '--ipc=host'
    }
  }

  triggers {
    // Fire on every push/PR via the GitHub webhook configured in JENKINS_SETUP.md.
    githubPush()
    // Nightly regression at 2am UTC (H = hashed minute to spread Jenkins load).
    cron('H 2 * * *')
  }

  environment {
    // Secrets are stored in Jenkins Credentials Store — never hardcoded here.
    // Add them via: Manage Jenkins → Credentials → Global → Add Credential (Secret text).
    BASE_URL          = credentials('codecept-base-url')
    API_URL           = credentials('codecept-api-url')
    ANTHROPIC_API_KEY = credentials('anthropic-api-key')

    // Runtime flags applied to every stage in this pipeline.
    HUSKY    = '0'      // skip git hooks (no .git inside the container)
    CI       = 'true'   // disables pauseOnFail and other interactive features
    HEADLESS = 'true'   // force browsers headless
    ENV      = 'dev'    // target environment (override per branch/job if needed)
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Lint & Typecheck') {
      steps {
        sh 'npm run typecheck && npm run lint'
      }
    }

    // Matrix runs one stage per browser in parallel.
    // Each browser writes Allure results to its own subdirectory to avoid
    // race conditions when both stages run simultaneously in the same workspace.
    stage('Test') {
      matrix {
        axes {
          axis {
            name 'BROWSER'
            values 'chromium', 'firefox'
          }
        }
        stages {
          stage('Run Tests') {
            steps {
              sh """
                BROWSER=${BROWSER} \
                ALLURE_RESULTS_DIR=output/reports/allure-${BROWSER} \
                npm run test:ci
              """
            }
          }
        }
      }
    }
  }

  post {
    always {
      // Merge both browser result dirs into a single Allure report.
      // Requires Allure Jenkins Plugin (see JENKINS_SETUP.md).
      allure includeProperties: false, results: [
        [path: 'output/reports/allure-chromium'],
        [path: 'output/reports/allure-firefox']
      ]

      // Archive screenshots, traces, and videos so they survive workspace cleanup.
      archiveArtifacts artifacts: 'output/screenshots/**,output/trace/**,output/videos/**',
                       allowEmptyArchive: true
    }

    failure {
      mail to: 'qa-team@company.com',
           subject: "FAILED: ${env.JOB_NAME} [${env.BUILD_NUMBER}]",
           body: """Build failed.

Job:   ${env.JOB_NAME}
Build: ${env.BUILD_NUMBER}
URL:   ${env.BUILD_URL}

Check the Allure report and archived artifacts for details."""
    }
  }
}
