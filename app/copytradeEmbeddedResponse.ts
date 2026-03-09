import {
  COPYTRADE_BACKTEST_STATE_KEY,
  COPYTRADE_LAST_ROUTE_STORAGE_KEY,
  DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE
} from "./copytradeDashboardSeed";

const authHeaders = {
  "access-token": "copytrade-local-access-token",
  "token-type": "Bearer",
  client: "copytrade-local-client",
  expiry: "4102444800",
  uid: "copytrade@local.test"
};

const mockUser = {
  first_name: "Copy",
  last_name: "Trade",
  username: "copytrade",
  email: "copytrade@local.test",
  role: "admin",
  is_suspended: false,
  public_uid: "copytrade-local-user",
  stripe_subscription_status: "active",
  stripe_subscription_original_status: "active",
  stripe_subscription_paused: false,
  stripe_subscription_paused_till: null,
  limits_overused: false,
  beta_level: "beta",
  features: [],
  display_currency: "USD",
  time_zone: "America/New_York",
  created_at: "2026-03-07T00:00:00.000Z",
  subscription_valid_until: "2099-12-31",
  profile_picture: null,
  plan: "pro",
  limits: {
    accounts: 999,
    replay: true,
    playbooks: 999,
    mentee: 999
  },
  onboarding_answers: {},
  is_admin_access: true,
  trialing: false,
  trial_start_at: null,
  intercom_user_jwt: "",
  black_friday_discount_redeemed: false,
  tour_progress: {}
};

const injectedCss = String.raw`
html,
body,
#root {
  height: 100%;
  background: #040404;
}

body {
  margin: 0;
  overflow: hidden;
  background: #040404;
  color-scheme: dark;
}

#korra-copytrade-shell {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: #040404;
  color: #f3f3f3;
  font-family: "SF Pro Text", "Segoe UI", sans-serif;
  padding: 18px 24px 28px;
  overflow: auto;
}

#korra-copytrade-shell[hidden] {
  display: none !important;
}

.korra-copytrade-shell__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 14px;
  border-bottom: 1px solid #141414;
}

.korra-copytrade-shell__eyebrow {
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7e7e7e;
  margin-bottom: 6px;
}

.korra-copytrade-shell__title {
  font-size: 14px;
  line-height: 1.4;
  font-weight: 600;
  color: #f6f6f6;
}

.korra-copytrade-shell__subtitle {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #8a8a8a;
}

.korra-copytrade-shell__button {
  appearance: none;
  border: 1px solid #242424;
  background: #080808;
  color: #f5f5f5;
  border-radius: 999px;
  padding: 8px 13px;
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.korra-copytrade-shell__button:hover {
  background: #101010;
  border-color: #343434;
}

.korra-copytrade-shell__button--primary {
  background: #f3f3f3;
  color: #050505;
  border-color: #f3f3f3;
}

.korra-copytrade-shell__button--primary:hover {
  background: #ffffff;
}

.korra-copytrade-shell__button--block {
  width: 100%;
  justify-content: center;
}

.korra-copytrade-shell__loadingOverlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 18;
  pointer-events: auto;
  background: rgba(4, 8, 12, 0.34);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.korra-copytrade-shell__loadingCore {
  display: grid;
  justify-items: center;
  gap: 0.62rem;
  padding: 0.72rem 0.95rem;
  border-radius: 14px;
  background: rgba(9, 15, 21, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.58);
}

.korra-copytrade-shell__loadingSpinner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.16);
  border-top-color: #00ff9d;
  border-right-color: #55d9ff;
  animation: korra-copytrade-shell-spin 0.88s linear infinite;
}

.korra-copytrade-shell__loadingText {
  font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, monospace;
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(226, 255, 240, 0.85);
  font-weight: 900;
}

.korra-copytrade-shell__table {
  width: 100%;
  border-top: 1px solid #171717;
  display: grid;
  gap: 8px;
}

.korra-copytrade-shell__row,
.korra-copytrade-shell__row--head {
  display: grid;
  grid-template-columns:
    minmax(210px, 1.35fr)
    repeat(6, minmax(108px, 1fr));
  align-items: center;
  gap: 18px;
}

.korra-copytrade-shell__row--head {
  padding: 4px 12px 10px;
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__row {
  padding: 16px 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #050505;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.korra-copytrade-shell__row[data-korra-action="view-statistics"] {
  cursor: pointer;
}

.korra-copytrade-shell__row[data-korra-action="view-statistics"]:hover {
  background: #080808;
  border-color: #242424;
  box-shadow: inset 0 0 0 1px #202020;
}

.korra-copytrade-shell__cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
}

.korra-copytrade-shell__cell--numeric {
  align-items: center;
  text-align: center;
}

.korra-copytrade-shell__cellLabel {
  display: none;
  margin-bottom: 4px;
  font-size: 9px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__headCell--numeric {
  align-items: center;
  text-align: center;
}

.korra-copytrade-shell__headCell--action {
  align-items: center;
  text-align: center;
}

.korra-copytrade-shell__name {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  color: #f7f7f7;
}

.korra-copytrade-shell__meta {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #7d7d7d;
}

.korra-copytrade-shell__money {
  font-size: 13px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: #f0f0f0;
}

.korra-copytrade-shell__count {
  font-size: 13px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: #f0f0f0;
}

.korra-copytrade-shell__moneySubtle {
  font-size: 11px;
  line-height: 1.5;
  color: #7d7d7d;
}

.korra-copytrade-shell__statusLine {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.korra-copytrade-shell__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #202020;
  background: #0b0b0b;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #cfcfcf;
}

.korra-copytrade-shell__pill::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #6e6e6e;
}

.korra-copytrade-shell__pill--green::before {
  background: #23c26b;
}

.korra-copytrade-shell__pill--blue::before {
  background: #4da3ff;
}

.korra-copytrade-shell__pill--amber::before {
  background: #ffb44d;
}

.korra-copytrade-shell__pill--red::before {
  background: #ff5f5f;
}

.korra-copytrade-shell__pill--gray::before {
  background: #707070;
}

.korra-copytrade-shell__rowAction {
  display: flex;
  justify-content: center;
  align-items: center;
  justify-self: stretch;
}

.korra-copytrade-shell__button--danger {
  border-color: #7f3030;
  background: rgba(127, 48, 48, 0.2);
  color: #ffd4d4;
}

.korra-copytrade-shell__button--danger:hover {
  background: rgba(151, 54, 54, 0.32);
  border-color: #a64040;
}

.korra-copytrade-shell__empty,
.korra-copytrade-shell__message {
  padding: 42px 0 24px;
  font-size: 12px;
  line-height: 1.7;
  color: #8c8c8c;
}

.korra-copytrade-shell__message--error {
  color: #ff8f8f;
}

.korra-copytrade-shell__section {
  margin-top: 26px;
  padding-top: 14px;
  border-top: 1px solid #171717;
}

.korra-copytrade-shell__sectionTitle {
  margin-bottom: 14px;
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__toolbarActions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  max-width: 100%;
  margin-left: auto;
  flex: 1 1 auto;
  min-width: 0;
}

.korra-copytrade-shell__toolbarActionGroup {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.korra-copytrade-shell__toolbarSelectWrap {
  position: relative;
  width: 144px;
  max-width: 144px;
  flex: 0 0 144px;
}

.korra-copytrade-shell__toolbarSelectWrap::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 12px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid #8a8a8a;
  border-bottom: 1.5px solid #8a8a8a;
  transform: translateY(-60%) rotate(45deg);
  pointer-events: none;
}

.korra-copytrade-shell__toolbarSelect {
  appearance: none;
  width: 100%;
  min-height: 32px;
  border: 1px solid #202020;
  border-radius: 999px;
  background: #0b0b0b;
  color: #dddddd;
  padding: 0 34px 0 12px;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.korra-copytrade-shell__toolbarSelect:focus {
  outline: none;
  border-color: #343434;
}

.korra-copytrade-shell__toolbarSelect:disabled {
  opacity: 0.55;
  cursor: default;
}

.korra-copytrade-shell__toolbarBack {
  flex-shrink: 0;
}

.korra-copytrade-shell__presetSelect,
.korra-copytrade-shell__compactInput {
  min-height: 32px;
  border: 1px solid #1e1e1e;
  border-radius: 10px;
  background: #090909;
  color: #f0f0f0;
  padding: 0 10px;
  font-size: 11px;
  line-height: 1.4;
}

.korra-copytrade-shell__presetSelect {
  min-width: 150px;
}

.korra-copytrade-shell__compactInput {
  min-width: 138px;
}

.korra-copytrade-shell__controlCard {
  margin-top: 20px;
  padding: 16px 18px;
  border: 1px solid #202020;
  border-radius: 24px;
  background: rgba(5, 5, 5, 0.9);
  box-shadow: 0 0 28px rgba(0, 0, 0, 0.34);
}

.korra-copytrade-shell__controlHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.korra-copytrade-shell__controlTitle {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
  color: #f3f3f3;
}

.korra-copytrade-shell__controlSubtitle {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: #7d7d7d;
}

.korra-copytrade-shell__controlActions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.korra-copytrade-shell__button--success {
  border-color: #1f4b36;
  background: rgba(35, 194, 107, 0.16);
  color: #c9ffe2;
}

.korra-copytrade-shell__button--success:hover {
  background: rgba(35, 194, 107, 0.24);
  border-color: #2a6a4a;
}

.korra-copytrade-shell__button--ghost {
  border-color: #202020;
  background: #0a0a0a;
}

.korra-copytrade-shell__controlsGrid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: minmax(0, 260px);
  gap: 10px;
}

.korra-copytrade-shell__controlField {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.korra-copytrade-shell__controlValue {
  min-height: 34px;
  display: flex;
  align-items: center;
  border: 1px solid #1d1d1d;
  border-radius: 10px;
  background: #070707;
  color: #f1f1f1;
  padding: 0 10px;
  font-size: 11px;
  line-height: 1.4;
  box-sizing: border-box;
}

.korra-copytrade-shell__controlFieldLabel {
  font-size: 9px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__controlInput,
.korra-copytrade-shell__controlSelect {
  width: 100%;
  min-height: 34px;
  border: 1px solid #1d1d1d;
  border-radius: 10px;
  background: #070707;
  color: #f1f1f1;
  padding: 0 10px;
  font-size: 11px;
  line-height: 1.4;
  box-sizing: border-box;
}

.korra-copytrade-shell__controlInput:focus,
.korra-copytrade-shell__controlSelect:focus,
.korra-copytrade-shell__presetSelect:focus,
.korra-copytrade-shell__compactInput:focus {
  outline: none;
  border-color: #313131;
}

.korra-copytrade-shell__feedback {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.5;
  color: #8c8c8c;
}

.korra-copytrade-shell__feedback--error {
  color: #ff9eaa;
}

.korra-copytrade-shell__feedback--success {
  color: #9eeec9;
}

.korra-copytrade-shell__formWrap {
  display: flex;
  justify-content: center;
  padding: 48px 0 24px;
}

.korra-copytrade-shell__formCard {
  width: 100%;
  max-width: 420px;
}

.korra-copytrade-shell__formTitle {
  font-size: 15px;
  line-height: 1.4;
  font-weight: 600;
  color: #f5f5f5;
}

.korra-copytrade-shell__formSubtitle {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.6;
  color: #7d7d7d;
}

.korra-copytrade-shell__form {
  margin-top: 22px;
  display: grid;
  gap: 12px;
}

.korra-copytrade-shell__field {
  display: grid;
  gap: 6px;
}

.korra-copytrade-shell__fieldLabel {
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__input {
  width: 100%;
  min-height: 40px;
  border: 1px solid #1d1d1d;
  border-radius: 10px;
  background: #090909;
  color: #f3f3f3;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1.4;
  box-sizing: border-box;
}

.korra-copytrade-shell__input:focus {
  outline: none;
  border-color: #3a3a3a;
}

.korra-copytrade-shell__statsGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.korra-copytrade-shell__stat {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid #191919;
  border-radius: 16px;
  background: linear-gradient(180deg, #0a0a0a 0%, #060606 100%);
}

.korra-copytrade-shell__statLabel {
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__statValue {
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  color: #f5f5f5;
  font-variant-numeric: tabular-nums;
}

.korra-copytrade-shell__statValue--green {
  color: #62f2b5;
}

.korra-copytrade-shell__statValue--red {
  color: #ff9eaa;
}

.korra-copytrade-shell__heroGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.korra-copytrade-shell__heroCard {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid #202020;
  border-radius: 24px;
  background: rgba(6, 6, 6, 0.9);
  box-shadow: 0 0 28px rgba(0, 0, 0, 0.32);
}

.korra-copytrade-shell__heroCardHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.korra-copytrade-shell__heroLabel {
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__heroAside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
}

.korra-copytrade-shell__heroAsideLabel {
  font-size: 10px;
  line-height: 1.3;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #666666;
}

.korra-copytrade-shell__heroAsideValue {
  font-size: 12px;
  line-height: 1.3;
  font-weight: 600;
  color: #d8d8d8;
  font-variant-numeric: tabular-nums;
}

.korra-copytrade-shell__heroValue {
  margin-top: 8px;
  font-size: 24px;
  line-height: 1.1;
  font-weight: 700;
  color: #f8f8f8;
  font-variant-numeric: tabular-nums;
}

.korra-copytrade-shell__heroValue--green {
  color: #62f2b5;
}

.korra-copytrade-shell__heroValue--red {
  color: #ff9eaa;
}

.korra-copytrade-shell__heroMeta {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #8a8a8a;
}

.korra-copytrade-shell__chartCard {
  margin-top: 18px;
  width: min(100%, 760px);
  margin-left: auto;
  margin-right: auto;
  padding: 12px 14px 10px;
  border: 1px solid #202020;
  border-radius: 24px;
  background: rgba(0, 0, 0, 0.8);
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
}

.korra-copytrade-shell__chartHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.korra-copytrade-shell__chartTitle {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  color: #f2f2f2;
}

.korra-copytrade-shell__chartSubtitle {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: #7f7f7f;
}

.korra-copytrade-shell__chartLegend {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.korra-copytrade-shell__chartLegendItem {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  line-height: 1.4;
  color: #d0d0d0;
}

.korra-copytrade-shell__chartLegendDot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.korra-copytrade-shell__chartSvg {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 8px;
}

.korra-copytrade-shell__chartStage {
  position: relative;
}

.korra-copytrade-shell__chartTooltip {
  position: absolute;
  top: 10px;
  left: 0;
  z-index: 2;
  min-width: 138px;
  padding: 10px 12px;
  border: 1px solid #1f2937;
  border-radius: 14px;
  background: #020617;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
  color: #e5e7eb;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 0);
  transition: opacity 120ms ease;
}

.korra-copytrade-shell__chartTooltip[data-visible="true"] {
  opacity: 1;
}

.korra-copytrade-shell__chartTooltipLabel {
  font-size: 10px;
  line-height: 1.4;
  color: #9ca3af;
}

.korra-copytrade-shell__chartTooltipRow {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
}

.korra-copytrade-shell__chartTooltipSwatch {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.korra-copytrade-shell__chartTooltipValue {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.korra-copytrade-shell__chartGuideLine,
.korra-copytrade-shell__chartGuideDot {
  pointer-events: none;
}

.korra-copytrade-shell__detailGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.korra-copytrade-shell__detailCard {
  min-width: 0;
  padding: 18px 20px 20px;
  border: 1px solid #202020;
  border-radius: 24px;
  background: rgba(5, 5, 5, 0.9);
  box-shadow: 0 0 28px rgba(0, 0, 0, 0.3);
}

.korra-copytrade-shell__detailCard .korra-copytrade-shell__sectionTitle {
  margin-bottom: 0;
}

.korra-copytrade-shell__detailCard--history {
  display: flex;
  flex-direction: column;
  min-height: 320px;
  padding: 0;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.7);
}

.korra-copytrade-shell__detailCardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(38, 38, 38, 0.7);
}

.korra-copytrade-shell__detailCardHeader .korra-copytrade-shell__sectionTitle {
  margin-bottom: 0;
  color: #efefef;
  letter-spacing: 0.04em;
  text-transform: none;
  font-size: 12px;
  font-weight: 600;
}

.korra-copytrade-shell__detailBadge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: #8f8f8f;
  font-size: 10px;
  line-height: 1;
}

.korra-copytrade-shell__detailSidePill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 16px;
  min-width: 48px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #343434;
  background: #111111;
  font-size: 8px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.korra-copytrade-shell__detailSidePill--buy {
  color: #67e8b2;
}

.korra-copytrade-shell__detailSidePill--sell {
  color: #ff9fb0;
}

.korra-copytrade-shell__detailSidePill--neutral {
  color: #d0d0d0;
}

.korra-copytrade-shell__detailScroll {
  flex: 1;
  overflow: auto;
  padding: 0 16px 12px;
}

.korra-copytrade-shell__detailTable {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0;
}

.korra-copytrade-shell__detailTable thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 10px;
  text-align: center;
  background: rgba(0, 0, 0, 0.96);
  font-size: 9px;
  line-height: 1.4;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #666666;
  font-weight: 500;
}

.korra-copytrade-shell__detailTable tbody td {
  padding: 10px 10px;
  border-top: 1px solid #101010;
  font-size: 10px;
  line-height: 1.5;
  color: #d6d6d6;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
  text-align: center;
}

.korra-copytrade-shell__detailTable tbody tr:first-child td {
  border-top: 1px solid #171717;
}

.korra-copytrade-shell__detailRow--positive td {
  background: rgba(74, 222, 128, 0.035);
}

.korra-copytrade-shell__detailRow--negative td {
  background: rgba(255, 143, 143, 0.04);
}

.korra-copytrade-shell__detailTable td:last-child,
.korra-copytrade-shell__detailTable th:last-child {
  text-align: center;
}

.korra-copytrade-shell__profit--positive {
  color: #4ade80;
}

.korra-copytrade-shell__profit--negative {
  color: #ff8f8f;
}

@media (max-width: 900px) {
  #korra-copytrade-shell {
    padding: 16px 16px 24px;
  }

  .korra-copytrade-shell__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .korra-copytrade-shell__toolbarActions,
  .korra-copytrade-shell__toolbarActionGroup,
  .korra-copytrade-shell__controlHeader,
  .korra-copytrade-shell__controlActions {
    justify-content: flex-start;
  }

  .korra-copytrade-shell__toolbarSelectWrap {
    width: 140px;
    max-width: 140px;
    flex: 0 0 140px;
  }

  .korra-copytrade-shell__toolbarBack {
    margin-left: 0;
  }

  .korra-copytrade-shell__presetSelect,
  .korra-copytrade-shell__compactInput {
    min-width: 0;
    width: 100%;
  }

  .korra-copytrade-shell__row,
  .korra-copytrade-shell__row--head {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .korra-copytrade-shell__row--head {
    display: none;
  }

  .korra-copytrade-shell__rowAction {
    justify-self: stretch;
    justify-content: center;
  }

  .korra-copytrade-shell__cell--numeric {
    text-align: center;
  }

  .korra-copytrade-shell__cellLabel {
    display: block;
  }

  .korra-copytrade-shell__heroGrid,
  .korra-copytrade-shell__detailGrid {
    grid-template-columns: minmax(0, 1fr);
  }

  .korra-copytrade-shell__controlsGrid,
  .korra-copytrade-shell__statsGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .korra-copytrade-shell__chartHeader {
    flex-direction: column;
  }

  .korra-copytrade-shell__chartLegend {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .korra-copytrade-shell__toolbarActions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .korra-copytrade-shell__toolbarActionGroup,
  .korra-copytrade-shell__toolbarSelectWrap,
  .korra-copytrade-shell__toolbarBack {
    width: 100%;
    max-width: none;
    flex-basis: 100%;
  }

  .korra-copytrade-shell__toolbarBack {
    margin-left: 0;
  }
}

@keyframes korra-copytrade-shell-spin {
  to {
    transform: rotate(360deg);
  }
}
`;

const injectedScript = `
(() => {
  const AUTH_HEADERS = ${JSON.stringify(authHeaders)};
  const COPYTRADE_BACKTEST_STORAGE_KEY = ${JSON.stringify(COPYTRADE_BACKTEST_STATE_KEY)};
  const DEFAULT_DASHBOARD_TEMPLATE = ${JSON.stringify(DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE)};
  const DEFAULT_DASHBOARD_RESPONSE = {
    data: [],
    items: [],
    results: [],
    templates: [],
    selected_template: DEFAULT_DASHBOARD_TEMPLATE,
    top_widgets: DEFAULT_DASHBOARD_TEMPLATE.top_widgets,
    bottom_widgets: DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets,
    count: 0,
    page: 1,
    per_page: 0,
    total_pages: 1,
    total_count: 0,
    winners: 0,
    losers: 0,
    break_evens: 0,
    total_gain_loss: 0,
    trade_count: 0,
    trade_expectancy: 0,
    profit_factor: 0,
    winning_trades_sum: 0,
    losing_trades_sum: 0,
    average_daily_volume: 0,
    average_winning_trade: 0,
    average_losing_trade: 0,
    total_commissions: 0,
    max_wins: 0,
    max_losses: 0,
    winning_days: 0,
    losing_days: 0,
    breakeven_days: 0,
    winning_trades_count: 0,
    losing_trades_count: 0,
    breakeven_trades_count: 0,
    day_streaks: {
      current_winning: 0,
      current_losing: 0,
      winning: 0,
      losing: 0
    },
    trade_streaks: {
      current_winning_streak: 0,
      current_losing_streak: 0,
      max_wins: 0,
      max_losses: 0
    },
    max_drawdown: {
      drawdown: 0,
      percent: 0
    },
    average_drawdown: {
      drawdown: 0,
      percent: 0
    },
    current_drawdown: {
      drawdown: 0,
      percent: 0
    }
  };
  const MOCK_USER = ${JSON.stringify(mockUser)};
  const API_HOST = "api.tradezella.com";
  const MARKET_DATA_PROXY_HOST = "market-data-proxy.herokuapp.com";
  const API_PATH_PREFIX = "/api";
  const LISTENER_EVENTS = [
    "readystatechange",
    "load",
    "loadend",
    "error",
    "abort",
    "timeout",
    "progress"
  ];
  const NativeXHR = window.XMLHttpRequest;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  const nativeOpen = typeof window.open === "function" ? window.open.bind(window) : null;
  let lastEmbeddedPath =
    localStorage.getItem(${JSON.stringify(COPYTRADE_LAST_ROUTE_STORAGE_KEY)}) ||
    (window.location.pathname + window.location.search + window.location.hash);
  const DIRECT_MT5_ADD_ACCOUNT_PATH = "/settings/account?view=add";
  const KORRA_COPYTRADE_SHELL_ID = "korra-copytrade-shell";
  const KORRA_COPYTRADE_LIST_VIEW = "list";
  const KORRA_COPYTRADE_ADD_VIEW = "add";
  const KORRA_COPYTRADE_STATS_VIEW = "statistics";
  const KORRA_COPYTRADE_LIST_CACHE_MS = 15_000;
  const KORRA_COPYTRADE_DETAIL_CACHE_MS = 15_000;

  const safeUrl = (input) => {
    try {
      return new URL(String(input), window.location.origin);
    } catch {
      return null;
    }
  };

  const isAuthRoute = (input) => {
    const parsed = safeUrl(input);
    return Boolean(parsed && parsed.pathname.startsWith("/auth/"));
  };

  const isTradezellaApiRequest = (input) => {
    const parsed = safeUrl(input);
    return Boolean(
        parsed &&
        parsed.hostname === API_HOST &&
        parsed.pathname.startsWith(API_PATH_PREFIX)
    );
  };

  const isMarketDataProxyRequest = (input) => {
    const parsed = safeUrl(input);
    return Boolean(parsed && parsed.hostname === MARKET_DATA_PROXY_HOST);
  };

  const normalizeEmbeddedPath = (input) => {
    const parsed = safeUrl(input);
    if (!parsed || parsed.origin !== window.location.origin || parsed.pathname.startsWith("/auth/")) {
      return null;
    }

    if (parsed.pathname === "/settings" || parsed.pathname === "/settings/") {
      parsed.pathname = "/settings/account";
      parsed.search = "";
    }

    if (parsed.pathname === "/settings/account-management") {
      parsed.pathname = "/settings/account";
      parsed.search = "";
    }

    if (parsed.pathname === "/ftux-add-trade" || parsed.pathname === "/ftux-add-trade/") {
      parsed.pathname = "/settings/account";
      parsed.search = "?view=add";
    }

    if (parsed.pathname === "/ftux-add-trade/mt5" || parsed.pathname === "/ftux-add-trade/mt5/") {
      parsed.pathname = "/settings/account";
      parsed.search = "?view=add";
    }

    if (
      parsed.pathname === "/ftux-add-trade/mt5/sync" ||
      parsed.pathname === "/ftux-add-trade/mt5/sync/"
    ) {
      parsed.pathname = "/settings/account";
      parsed.search = "?view=add";
    }

    return parsed.pathname + parsed.search + parsed.hash;
  };

  const rememberEmbeddedPath = (input) => {
    const normalized = normalizeEmbeddedPath(input);
    if (!normalized) {
      return;
    }

    let storedPath = normalized;
    if (normalized.startsWith("/settings/account")) {
      const parsed = safeUrl(normalized);
      if (parsed) {
        parsed.searchParams.delete("seed");
        storedPath = parsed.pathname + parsed.search + parsed.hash;
      }
    }

    lastEmbeddedPath = storedPath;
    try {
      localStorage.setItem(${JSON.stringify(COPYTRADE_LAST_ROUTE_STORAGE_KEY)}, storedPath);
    } catch {
      // Ignore storage failures.
    }
  };

  const persistAuthHeaders = () => {
    Object.entries(AUTH_HEADERS).forEach(([key, value]) => {
      localStorage.setItem(key, String(value));
    });
    localStorage.setItem("drawerPosition", "true");
    localStorage.setItem("openSidebar", "true");
  };

  const cloneDefaultDashboardResponse = () =>
    JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_RESPONSE));

  const cloneJson = (value, fallback) => {
    const target = value == null ? fallback : value;

    try {
      return JSON.parse(JSON.stringify(target));
    } catch {
      return JSON.parse(JSON.stringify(fallback));
    }
  };

  const readBacktestSeed = () => {
    try {
      const raw = localStorage.getItem(COPYTRADE_BACKTEST_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      const nextSeed = cloneJson(parsed, {});
      const dashboardStats =
        nextSeed.dashboardStats && typeof nextSeed.dashboardStats === "object"
          ? nextSeed.dashboardStats
          : null;
      const selectedTemplate =
        dashboardStats &&
        dashboardStats.selected_template &&
        typeof dashboardStats.selected_template === "object"
          ? dashboardStats.selected_template
          : null;
      let didNormalize = false;

      if (
        dashboardStats &&
        REPLACED_DASHBOARD_BOTTOM_WIDGETS.some((widgets) =>
          arraysEqual(dashboardStats.bottom_widgets, widgets)
        )
      ) {
        dashboardStats.bottom_widgets = [...DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets];
        didNormalize = true;
      }

      if (
        selectedTemplate &&
        REPLACED_DASHBOARD_BOTTOM_WIDGETS.some((widgets) =>
          arraysEqual(selectedTemplate.bottom_widgets, widgets)
        )
      ) {
        selectedTemplate.bottom_widgets = [...DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets];
        didNormalize = true;
      }

      if (didNormalize) {
        localStorage.setItem(COPYTRADE_BACKTEST_STORAGE_KEY, JSON.stringify(nextSeed));
      }

      return nextSeed;
    } catch {
      return null;
    }
  };

  const DEFAULT_DAY_VIEW_COLUMNS = [
    "open_time",
    "symbol",
    "side",
    "instrument",
    "net_profits",
    "net_roi",
    "realized_rr",
    "tags",
    "playbook"
  ];

  const DEFAULT_TRADE_VIEW_COLUMNS = [
    "open_date",
    "symbol",
    "status",
    "close_date",
    "entry_price",
    "exit_price",
    "net_profits",
    "net_roi",
    "insights",
    "zella_score"
  ];

  const DEFAULT_TRADE_DETAIL_FIELDS = [
    "account",
    "adjusted_cost",
    "avg_buy_price",
    "avg_sell_price",
    "bestExitPrice",
    "bestExitTime",
    "commissions",
    "exit_levels",
    "grossPL",
    "initialTarget",
    "mae_mfe",
    "open_time",
    "close_time",
    "pips",
    "points",
    "profitTarget",
    "quantity",
    "rewardRatio",
    "roi",
    "running_pl",
    "side",
    "stopLoss",
    "strategy",
    "tags",
    "ticks",
    "ticks_per_contract",
    "trade_rating",
    "tradeRisk",
    "zella_scale"
  ];

  const DEFAULT_TRADE_DETAILS_SETTINGS = {
    checked: DEFAULT_TRADE_DETAIL_FIELDS
  };

  const DEFAULT_SESSION_CUSTOM_SETTINGS = {};
  const DEFAULT_BACKTESTING_VIEW_SETTINGS = {};
  const DEFAULT_AVAILABLE_REPORT_DIMENSIONS = [
    {
      name: "month",
      pretty_name: "Month",
      group: "Date"
    },
    {
      name: "year",
      pretty_name: "Year",
      group: "Date"
    }
  ];

  const DEFAULT_LOCAL_ACCOUNT = {
    id: "local",
    name: "Local",
    account_type: "manual",
    archived: false,
    active: true,
    backtesting: false,
    trades_editable: true,
    read_only: true,
    count: 0,
    running_balance: 0,
    import_type: "manual",
    broker: null,
    external_account_id: null,
    external_account_failed: false,
    clear_in_progress: false,
    sync_disconnected: false,
    disabled: false,
    failed: false,
    can_resync: false,
    next_manual_resync_time: null,
    next_sync_time: null,
    last_sync_time: null,
    has_trades: false,
    has_performance_report: false,
    profit_calculation_method: "fifo",
    shared: false,
    primary: true,
    color: "#2563eb",
    trades_count: 0,
    account_size: 0,
    last_import: null,
    last_imported_at: null,
    imports: [],
    broker_name: "Local",
    display_broker_name: "Local",
    created_at: MOCK_USER.created_at,
    updated_at: MOCK_USER.created_at,
    display_currency: MOCK_USER.display_currency,
    time_zone: MOCK_USER.time_zone,
    user_public_uid: MOCK_USER.public_uid
  };

  const DEFAULT_BROKER_OPTIONS = [
    {
      label: "cTrader",
      value: "ctrader",
      broker: "cTrader",
      icon: "ctrader",
      search_aliases: ["ctrader"]
    },
    {
      label: "TopstepX",
      value: "topstepx",
      broker: "TopstepX",
      icon: "topstepx",
      search_aliases: ["topstepx", "topstep"]
    },
    {
      label: "TradeLocker",
      value: "trade_locker",
      broker: "TradeLocker",
      icon: "trade_locker",
      search_aliases: ["tradelocker", "trade locker"]
    },
    {
      label: "Interactive Brokers",
      value: "interactive_brokers",
      broker: "Interactive Brokers",
      icon: "interactive_brokers",
      search_aliases: ["interactive brokers", "ibkr", "ib"]
    },
    {
      label: "MetaTrader 4",
      value: "mt4",
      broker: "MetaTrader 4",
      icon: "mt4",
      search_aliases: ["mt4", "metatrader 4", "meta trader 4"]
    },
    {
      label: "MetaTrader 5",
      value: "mt5",
      broker: "MetaTrader 5",
      icon: "mt5",
      search_aliases: ["mt5", "metatrader 5", "meta trader 5"]
    },
    {
      label: "thinkorswim",
      value: "think_or_swim",
      broker: "thinkorswim",
      icon: "think_or_swim",
      search_aliases: ["thinkorswim", "think or swim", "tos"]
    },
    {
      label: "Tradovate",
      value: "tradovate",
      broker: "Tradovate",
      icon: "tradovate",
      search_aliases: ["tradovate"]
    },
    {
      label: "TradingView",
      value: "trading_view",
      broker: "TradingView",
      icon: "trading_view",
      search_aliases: ["tradingview", "trading view"]
    },
    {
      label: "NinjaTrader",
      value: "ninja",
      broker: "NinjaTrader",
      icon: "ninja",
      search_aliases: ["ninjatrader", "ninja trader"]
    },
    {
      label: "DXtrade",
      value: "dx_trade",
      broker: "DXtrade",
      icon: "dx_trade",
      search_aliases: ["dxtrade", "dx trade"]
    },
    {
      label: "OANDA",
      value: "oanda",
      broker: "OANDA",
      icon: "oanda",
      search_aliases: ["oanda"]
    },
    {
      label: "Generic Template",
      value: "generic",
      broker: "Generic Template",
      icon: "generic",
      search_aliases: ["generic", "manual import"]
    }
  ];

  const LEGACY_DASHBOARD_BOTTOM_WIDGETS = [
    "zella_score",
    "daily_net_cumulative_graph",
    "net_daily_pl_graph",
    "performance_calendar"
  ];

  const PREVIOUS_COPYTRADE_DASHBOARD_BOTTOM_WIDGETS = [
    "zella_score",
    "daily_net_cumulative_graph",
    "net_daily_pl_graph",
    "calendar_widget"
  ];

  const REPLACED_DASHBOARD_BOTTOM_WIDGETS = [
    LEGACY_DASHBOARD_BOTTOM_WIDGETS,
    PREVIOUS_COPYTRADE_DASHBOARD_BOTTOM_WIDGETS
  ];

  const arraysEqual = (left, right) =>
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

  const compareValues = (left, right) => {
    if (typeof left === "string" || typeof right === "string") {
      return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    }

    return Number(left ?? 0) - Number(right ?? 0);
  };

  const getTradeDateKey = (value) => {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const getSeedAccounts = (seed) => {
    const accounts = cloneJson(seed && seed.accounts, []);
    return accounts.length > 0
      ? accounts.map((account) => ({
          ...cloneJson(DEFAULT_LOCAL_ACCOUNT, {}),
          ...account,
          imports: Array.isArray(account && account.imports) ? account.imports : []
        }))
      : [cloneJson(DEFAULT_LOCAL_ACCOUNT, {})];
  };

  const getSeedTrades = (seed) =>
    cloneJson(seed && seed.allTrades && seed.allTrades.trades, []);

  const escapeRegExp = (value) =>
    String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\\\$&");

  const getParamValues = (searchParams, key) => {
    const results = [];
    const patterns = [
      key,
      key + "[]"
    ];

    searchParams.forEach((value, currentKey) => {
      if (
        patterns.includes(currentKey) ||
        new RegExp("^" + escapeRegExp(key) + "\\\\[\\\\d+\\\\]$").test(currentKey)
      ) {
        results.push(value);
      }
    });

    return results.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  };

  const getNestedParamValues = (searchParams, root, key) => {
    const escapedRoot = escapeRegExp(root);
    const escapedKey = escapeRegExp(key);
    const matcher = new RegExp(
      "^" + escapedRoot + "\\\\[" + escapedKey + "\\\\](?:\\\\[\\\\d+\\\\]|\\\\[\\\\])?$"
    );
    const results = [];

    searchParams.forEach((value, currentKey) => {
      if (matcher.test(currentKey)) {
        results.push(value);
      }
    });

    return results.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  };

  const getFilterValues = (searchParams, key) => [
    ...getParamValues(searchParams, key),
    ...getNestedParamValues(searchParams, "filters", key)
  ];

  const getFilterValue = (searchParams, key) => getFilterValues(searchParams, key)[0] || null;

  const normalizeDateValue = (value) => {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const buildSeedDailyRows = (seed, searchParams) => {
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams)
      .sort((left, right) => getTradeDateKey(left.realized).localeCompare(getTradeDateKey(right.realized)));
    const dailyMap = new Map();

    filteredTrades.forEach((trade) => {
      const dayKey = getTradeDateKey(trade.realized);
      const current = dailyMap.get(dayKey) || {
        day: dayKey,
        date: dayKey,
        net: 0,
        grossWins: 0,
        grossLosses: 0,
        totalTrades: 0,
        winners: 0,
        losers: 0,
        breakEvens: 0,
        longs: 0,
        shorts: 0
      };
      const pnl = Number(trade.net_profits || 0);
      const normalizedSide = String(trade.side || "").toLowerCase();

      current.net += pnl;
      current.totalTrades += 1;
      if (normalizedSide.includes("long") || normalizedSide.includes("buy")) {
        current.longs += 1;
      } else if (normalizedSide.includes("short") || normalizedSide.includes("sell")) {
        current.shorts += 1;
      }
      if (pnl > 0) {
        current.grossWins += pnl;
        current.winners += 1;
      } else if (pnl < 0) {
        current.grossLosses += Math.abs(pnl);
        current.losers += 1;
      } else {
        current.breakEvens += 1;
      }

      dailyMap.set(dayKey, current);
    });

    let cumulativePl = 0;
    let cumulativeWins = 0;
    let cumulativeLossMagnitude = 0;
    let cumulativeTrades = 0;
    let cumulativeLongs = 0;
    let cumulativeShorts = 0;
    let peak = 0;
    let drawdownSum = 0;

    return Array.from(dailyMap.values())
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((row) => {
        cumulativePl += row.net;
        cumulativeWins += row.grossWins;
        cumulativeLossMagnitude += row.grossLosses;
        cumulativeTrades += row.totalTrades;
        cumulativeLongs += row.longs;
        cumulativeShorts += row.shorts;
        peak = Math.max(peak, cumulativePl);
        const drawdown = Math.min(0, cumulativePl - peak);
        drawdownSum += Math.abs(drawdown);

        return {
          ...row,
          cumulativePl,
          cumulativeTrades,
          cumulativeLongs,
          cumulativeShorts,
          cumulativeWinPercentage: 0,
          cumulativeProfitFactor:
            cumulativeLossMagnitude > 0
              ? cumulativeWins / cumulativeLossMagnitude
              : cumulativeWins > 0
                ? cumulativeWins
                : 0,
          cumulativeTradeExpectancy: cumulativeTrades > 0 ? cumulativePl / cumulativeTrades : 0,
          drawdown,
          maxDrawdown: drawdown,
          averageDrawdown: cumulativeTrades > 0 ? -(drawdownSum / cumulativeTrades) : 0
        };
      })
      .map((row, index, rows) => {
        const cumulativeWinsCount = rows
          .slice(0, index + 1)
          .reduce((total, current) => total + current.winners, 0);

        return {
          ...row,
          cumulativeWinPercentage:
            row.cumulativeTrades > 0 ? (cumulativeWinsCount / row.cumulativeTrades) * 100 : 0
        };
      });
  };

  const normalizeAccountSelection = (searchParams) =>
    getFilterValues(searchParams, "accounts")
      .filter(Boolean)
      .filter((value) => value !== "all");

  const filterTrades = (seed, searchParams) => {
    let trades = getSeedTrades(seed);
    const selectedAccounts = normalizeAccountSelection(searchParams);
    if (
      selectedAccounts.length > 0 &&
      !selectedAccounts.includes(DEFAULT_LOCAL_ACCOUNT.id)
    ) {
      return [];
    }

    const startDate = normalizeDateValue(getFilterValue(searchParams, "start_date") || getFilterValue(searchParams, "startDate"));
    const endDate = normalizeDateValue(getFilterValue(searchParams, "end_date") || getFilterValue(searchParams, "endDate"));
    if (startDate) {
      trades = trades.filter((trade) => getTradeDateKey(trade.realized) >= startDate);
    }
    if (endDate) {
      trades = trades.filter((trade) => getTradeDateKey(trade.realized) <= endDate);
    }

    const symbol = getFilterValue(searchParams, "symbol");
    if (symbol) {
      const needle = symbol.trim().toLowerCase();
      trades = trades.filter((trade) =>
        String(trade.symbol || "").toLowerCase().includes(needle)
      );
    }

    return trades;
  };

  const sortTrades = (trades, searchParams) => {
    const sortBy = getFilterValue(searchParams, "sort_by") || getFilterValue(searchParams, "sortBy") || "realized";
    const direction = (getFilterValue(searchParams, "direction") || "desc").toLowerCase();
    const factor = direction === "asc" ? 1 : -1;

    return [...trades].sort((left, right) => {
      const comparison = compareValues(left[sortBy], right[sortBy]);
      if (comparison !== 0) {
        return comparison * factor;
      }

      return compareValues(left.realized, right.realized) * -1;
    });
  };

  const paginateItems = (items, searchParams) => {
    const totalCount = items.length;
    const requestedPerPage = Number(getFilterValue(searchParams, "per_page") || getFilterValue(searchParams, "perPage"));
    const perPage =
      Number.isFinite(requestedPerPage) && requestedPerPage > 0
        ? Math.floor(requestedPerPage)
        : totalCount > 0
          ? totalCount
          : 25;
    const requestedPage = Number(getFilterValue(searchParams, "page"));
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.floor(requestedPage)
        : 1;
    const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
    const safePage = Math.min(page, pageCount);
    const startIndex = (safePage - 1) * perPage;
    const pagedItems = items.slice(startIndex, startIndex + perPage);

    return {
      items: pagedItems,
      pageCount,
      from: totalCount === 0 ? 0 : startIndex + 1,
      to: totalCount === 0 ? 0 : startIndex + pagedItems.length
    };
  };

  const filterDays = (seed, searchParams) => {
    const days = cloneJson(seed && seed.days && seed.days.days, []);
    const selectedAccounts = normalizeAccountSelection(searchParams);
    if (
      selectedAccounts.length > 0 &&
      !selectedAccounts.includes(DEFAULT_LOCAL_ACCOUNT.id)
    ) {
      return [];
    }

    const startDate = normalizeDateValue(getFilterValue(searchParams, "start_date") || getFilterValue(searchParams, "startDate"));
    const endDate = normalizeDateValue(getFilterValue(searchParams, "end_date") || getFilterValue(searchParams, "endDate"));
    return days.filter((day) => {
      const dayKey = normalizeDateValue(day.realized || day.day || "");
      if (startDate && dayKey < startDate) {
        return false;
      }
      if (endDate && dayKey > endDate) {
        return false;
      }
      return true;
    });
  };

  const createDashboardStatsPayload = (seed) => ({
    ...cloneDefaultDashboardResponse(),
    ...cloneJson(seed && seed.dashboardStats, {}),
    data: [],
    items: [],
    results: []
  });

  const createStatsPayload = (seed) => ({
    winners: 0,
    losers: 0,
    break_evens: 0,
    volume: 0,
    gross_pl: 0,
    net_pl: 0,
    profit_factor: 0,
    total_commissions: 0,
    trade_count: 0,
    ...cloneJson(seed && seed.stats, {})
  });

  const createZellaScorePayload = (seed) => ({
    win_rate: 0,
    win_rate_value: 0,
    profit_factor: 0,
    profit_factor_value: 0,
    avg_win_to_loss: 0,
    avg_win_to_loss_value: 0,
    recovery_factor: 0,
    recovery_factor_value: 0,
    max_drawdown: 0,
    max_drawdown_value: 0,
    consistency: 0,
    consistency_value: 0,
    zella_score: 0,
    ...cloneJson(seed && seed.zellaScore, {})
  });

  const createOnboardingPayload = () => ({
    answers: {},
    onboarded: true,
    preferences_saved: true,
    state: "onboarding",
    step: 0,
    video_watched: true
  });

  const createPerformancePayload = (seed) =>
    cloneJson(seed && seed.performance, []);

  const createCumulativePayload = (seed) => ({
    cumulative: [],
    drawdown: [],
    ...cloneJson(seed && seed.cumulative, {})
  });

  const createAccountBalanceDatumPayload = (seed) => ({
    result: [],
    balances: [],
    labels: [],
    ...cloneJson(seed && seed.accountBalanceDatum, {})
  });

  const createTradeCollectionPayload = (seed, key) => ({
    trades: [],
    item_count: 0,
    ...cloneJson(seed && seed[key], {})
  });

  const createTradesPresentPayload = (seed, searchParams) => ({
    trades_present: filterTrades(seed, searchParams).length > 0
  });

  const createAllTradesPayload = (seed, searchParams) => {
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams);
    const page = paginateItems(filteredTrades, searchParams);

    return {
      trades: page.items,
      item_count: filteredTrades.length,
      page_count: page.pageCount,
      from: page.from,
      to: page.to
    };
  };

  const createTradeStatsPayload = (seed, searchParams) => {
    const filteredTrades = filterTrades(seed, searchParams);
    let gains = 0;
    let losses = 0;
    let volume = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    filteredTrades.forEach((trade) => {
      const pnl = Number(trade.net_profits || 0);
      volume += Math.abs(Number(trade.quantity || 0));
      if (pnl > 0) {
        gains += pnl;
        winningTrades += 1;
      } else if (pnl < 0) {
        losses += Math.abs(pnl);
        losingTrades += 1;
      }
    });

    return {
      gain: gains,
      loss: losses,
      total_net_profits: gains - losses,
      total_volume: volume,
      profit_factor: losses > 0 ? gains / losses : gains > 0 ? gains : 0,
      average_winning_trade: winningTrades > 0 ? gains / winningTrades : 0,
      average_losing_trade: losingTrades > 0 ? -losses / losingTrades : 0,
      total_trades: filteredTrades.length
    };
  };

  const createDayViewPayload = (seed, searchParams) => ({
    days: filterDays(seed, searchParams),
    page_count: 1
  });

  const createWeekTradesPayload = (seed, searchParams) => {
    const completeFilter = getFilterValue(searchParams, "complete");
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams).filter(
      (trade) => {
        const normalizedStatus = String(trade && trade.status || "").toLowerCase();

        if (String(completeFilter).toLowerCase() === "false") {
          return normalizedStatus === "open";
        }

        return normalizedStatus !== "open";
      }
    );
    const page = paginateItems(filteredTrades, searchParams);

    return {
      trades: page.items,
      item_count: filteredTrades.length,
      page_count: page.pageCount,
      from: page.from,
      to: page.to
    };
  };

  const createTradeDetailPayload = (seed, tradeId) => {
    const tradeDetails = cloneJson(seed && seed.tradeDetails, {});
    if (tradeDetails && tradeDetails[tradeId]) {
      return tradeDetails[tradeId];
    }

    const trade = getSeedTrades(seed).find((entry) => String(entry.id) === String(tradeId));
    return trade ? cloneJson(trade, {}) : cloneJson(getSeedTrades(seed)[0], {});
  };

  const createTradeRunningPlPayload = (seed, searchParams) => {
    const tradeId = getFilterValue(searchParams, "id") || getFilterValue(searchParams, "trade_id");
    const trade = createTradeDetailPayload(seed, tradeId);
    const performance = Array.isArray(trade && trade.performance) ? trade.performance : [];

    if (performance.length === 0) {
      return [];
    }

    return performance.map((point) => ({
      time: Math.floor(new Date(point.realized).getTime() / 1000),
      pl: Number(point.total_pl ?? point.net_profits ?? 0)
    }));
  };

  const createBalanceTransactionsPayload = (seed, searchParams) => {
    const accountId = getFilterValue(searchParams, "account_id") || DEFAULT_LOCAL_ACCOUNT.id;
    const account = getSeedAccounts(seed).find((entry) => entry.id === accountId)
      || getSeedAccounts(seed)[0]
      || DEFAULT_LOCAL_ACCOUNT;

    return {
      account_id: account.id,
      account_balance: Number(account.running_balance || 0),
      transactions: []
    };
  };

  const createInitialBalancePayload = (seed) => {
    const account = getSeedAccounts(seed)[0] || DEFAULT_LOCAL_ACCOUNT;
    return {
      initial_balance: Number(account.account_size || account.running_balance || 0)
    };
  };

  const createLastImportPayload = (seed) =>
    cloneJson(seed && seed.lastImport, null);

  const createAccountImportsPayload = (seed) => ({
    imports: [],
    meta: {
      pages: 1
    }
  });

  const createDailyNotePayload = (searchParams) => {
    const noteDate =
      normalizeDateValue(getFilterValue(searchParams, "note_date") || getFilterValue(searchParams, "noteDate"))
      || normalizeDateValue(getFilterValue(searchParams, "day"))
      || normalizeDateValue(new Date().toISOString());
    const timestamp = new Date().toISOString();

    return {
      id: "daily-note-" + noteDate,
      notebook_folder_id: "local-daily-notes",
      note_date: noteDate,
      title: noteDate,
      content: "",
      lexical_content: "",
      created_at: timestamp,
      updated_at: timestamp,
      folder_category: "daily_note"
    };
  };

  const createStartYourDayPayload = (searchParams) => ({
    day:
      normalizeDateValue(getFilterValue(searchParams, "day"))
      || normalizeDateValue(new Date().toISOString()),
    can_finish: false,
    can_show_assist: false,
    assist: {
      manually_closed: true,
      data: []
    }
  });

  const REPORT_METRIC_DEFINITIONS = {
    cumulative_pl: {
      pretty_name: "P&L - cumulative",
      data_type: "currency",
      group: "Performance"
    },
    cumulative_win_percentage: {
      pretty_name: "Win rate - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_total_closed_count: {
      pretty_name: "Total trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_profit_factor: {
      pretty_name: "Profit factor - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_trade_expectancy: {
      pretty_name: "Trade expectancy - cumulative",
      data_type: "currency",
      group: "Performance"
    },
    cumulative_bucketed_max_drawdown: {
      pretty_name: "Max drawdown - cumulative",
      data_type: "currency",
      group: "Risk"
    },
    cumulative_bucketed_avg_drawdown: {
      pretty_name: "Avg drawdown - cumulative",
      data_type: "currency",
      group: "Risk"
    },
    cumulative_longs_total_count: {
      pretty_name: "Long trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_shorts_total_count: {
      pretty_name: "Short trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    total_pl: {
      pretty_name: "P&L",
      data_type: "currency",
      group: "Performance"
    },
    net_pnl: {
      pretty_name: "Net P&L",
      data_type: "currency",
      group: "Performance"
    },
    win_percentage: {
      pretty_name: "Win rate",
      data_type: "number",
      group: "Performance"
    },
    total_closed_count: {
      pretty_name: "Total trades",
      data_type: "number",
      group: "Performance"
    },
    profit_factor: {
      pretty_name: "Profit factor",
      data_type: "number",
      group: "Performance"
    },
    trade_expectancy: {
      pretty_name: "Trade expectancy",
      data_type: "currency",
      group: "Performance"
    },
    drawdown: {
      pretty_name: "Drawdown",
      data_type: "currency",
      group: "Risk"
    },
    max_drawdown: {
      pretty_name: "Max drawdown",
      data_type: "currency",
      group: "Risk"
    },
    average_win: {
      pretty_name: "Average win",
      data_type: "currency",
      group: "Performance"
    },
    average_loss: {
      pretty_name: "Average loss",
      data_type: "currency",
      group: "Performance"
    }
  };

  const getReportMetricDefinition = (metricKey) =>
    REPORT_METRIC_DEFINITIONS[metricKey] || {
      pretty_name: String(metricKey || "Metric")
        .replace(/^cumulative_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase()),
      data_type: "number",
      group: "Custom"
    };

  const getReportMetricValue = (row, metricKey) => {
    switch (metricKey) {
      case "cumulative_pl":
        return row.cumulativePl;
      case "cumulative_win_percentage":
        return row.cumulativeWinPercentage;
      case "cumulative_total_closed_count":
        return row.cumulativeTrades;
      case "cumulative_profit_factor":
        return row.cumulativeProfitFactor;
      case "cumulative_trade_expectancy":
        return row.cumulativeTradeExpectancy;
      case "cumulative_bucketed_max_drawdown":
        return row.maxDrawdown;
      case "cumulative_bucketed_avg_drawdown":
        return row.averageDrawdown;
      case "cumulative_longs_total_count":
        return row.cumulativeLongs;
      case "cumulative_shorts_total_count":
        return row.cumulativeShorts;
      case "total_pl":
      case "net_pnl":
        return row.net;
      case "win_percentage":
        return row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0;
      case "total_closed_count":
        return row.totalTrades;
      case "profit_factor":
        return row.grossLosses > 0
          ? row.grossWins / row.grossLosses
          : row.grossWins > 0
            ? row.grossWins
            : 0;
      case "trade_expectancy":
        return row.totalTrades > 0 ? row.net / row.totalTrades : 0;
      case "drawdown":
      case "max_drawdown":
        return row.drawdown;
      case "average_win":
        return row.winners > 0 ? row.grossWins / row.winners : 0;
      case "average_loss":
        return row.losers > 0 ? -(row.grossLosses / row.losers) : 0;
      default:
        return row.net;
    }
  };

  const createNewReportsAvailablePayload = () =>
    Object.entries(REPORT_METRIC_DEFINITIONS).map(([name, definition]) => ({
      key: name,
      name,
      pretty_name: definition.pretty_name,
      data_type: definition.data_type,
      group: definition.group
    }));

  const createMonthlyReportRows = (seed, searchParams) => {
    const filteredTrades = filterTrades(seed, searchParams);
    const monthlyMap = new Map();

    filteredTrades.forEach((trade) => {
      const realizedDate = new Date(trade.realized || trade.created_at || Date.now());
      if (Number.isNaN(realizedDate.getTime())) {
        return;
      }

      const monthIndex = realizedDate.getUTCMonth();
      const year = realizedDate.getUTCFullYear();
      const key = year + "-" + String(monthIndex + 1).padStart(2, "0");
      const current = monthlyMap.get(key) || {
        key,
        year,
        monthIndex,
        monthValue: String(monthIndex + 1),
        monthTitle: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex],
        startDate: year + "-" + String(monthIndex + 1).padStart(2, "0") + "-01",
        net: 0,
        grossWins: 0,
        grossLosses: 0,
        totalTrades: 0,
        winners: 0,
        losers: 0,
        longs: 0,
        shorts: 0
      };
      const pnl = Number(trade.net_profits || 0);
      const normalizedSide = String(trade.side || "").toLowerCase();

      current.net += pnl;
      current.totalTrades += 1;
      if (normalizedSide.includes("long") || normalizedSide.includes("buy")) {
        current.longs += 1;
      } else if (normalizedSide.includes("short") || normalizedSide.includes("sell")) {
        current.shorts += 1;
      }
      if (pnl > 0) {
        current.grossWins += pnl;
        current.winners += 1;
      } else if (pnl < 0) {
        current.grossLosses += Math.abs(pnl);
        current.losers += 1;
      }

      monthlyMap.set(key, current);
    });

    return Array.from(monthlyMap.values()).sort((left, right) => left.key.localeCompare(right.key));
  };

  const createNewReportsPayload = (seed, searchParams) => {
    const metrics = getParamValues(searchParams, "metrics");
    const dimensions = getParamValues(searchParams, "dimensions");
    const timeBucket = getFilterValue(searchParams, "time_bucket") || "day";

    if (metrics.length === 0) {
      return {
        data: []
      };
    }

    if (dimensions.includes("month") && dimensions.includes("year")) {
      const rows = createMonthlyReportRows(seed, searchParams);
      return {
        data: metrics.flatMap((metricKey) => {
          const definition = getReportMetricDefinition(metricKey);
          return rows.map((row) => ({
            metadata: {
              metric_key: metricKey,
              metric_name: definition.pretty_name,
              pretty_name: definition.pretty_name,
              data_type: definition.data_type,
              dimensions_keys: ["month", "year"],
              dimensions: [row.monthValue, String(row.year)],
              dimensions_metadata: [
                {
                  title: row.monthTitle,
                  dimension: row.monthValue
                },
                {
                  title: String(row.year),
                  dimension: String(row.year)
                }
              ],
              supporting_data: []
            },
            data: [
              {
                date: row.startDate,
                metric: getReportMetricValue(
                  {
                    ...row,
                    cumulativePl: row.net,
                    cumulativeTrades: row.totalTrades,
                    cumulativeLongs: row.longs,
                    cumulativeShorts: row.shorts,
                    cumulativeWinPercentage: row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0,
                    cumulativeProfitFactor:
                      row.grossLosses > 0
                        ? row.grossWins / row.grossLosses
                        : row.grossWins > 0
                          ? row.grossWins
                          : 0,
                    cumulativeTradeExpectancy: row.totalTrades > 0 ? row.net / row.totalTrades : 0,
                    drawdown: Math.min(0, row.net),
                    maxDrawdown: Math.min(0, row.net),
                    averageDrawdown: Math.min(0, row.net)
                  },
                  metricKey
                )
              }
            ]
          }));
        })
      };
    }

    const rows = buildSeedDailyRows(seed, searchParams);
    const groupedRows = timeBucket === "month"
      ? createMonthlyReportRows(seed, searchParams).map((row) => ({
          ...row,
          date: row.startDate,
          cumulativePl: row.net,
          cumulativeTrades: row.totalTrades,
          cumulativeLongs: row.longs,
          cumulativeShorts: row.shorts,
          cumulativeWinPercentage: row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0,
          cumulativeProfitFactor:
            row.grossLosses > 0
              ? row.grossWins / row.grossLosses
              : row.grossWins > 0
                ? row.grossWins
                : 0,
          cumulativeTradeExpectancy: row.totalTrades > 0 ? row.net / row.totalTrades : 0,
          drawdown: Math.min(0, row.net),
          maxDrawdown: Math.min(0, row.net),
          averageDrawdown: Math.min(0, row.net)
        }))
      : rows;

    return {
      data: metrics.map((metricKey) => {
        const definition = getReportMetricDefinition(metricKey);
        return {
          metadata: {
            metric_key: metricKey,
            metric_name: definition.pretty_name,
            pretty_name: definition.pretty_name,
            data_type: definition.data_type,
            supporting_data: []
          },
          data: groupedRows.map((row) => ({
            date: row.date,
            metric: getReportMetricValue(row, metricKey)
          }))
        };
      })
    };
  };

  const createCalendarEventsPayload = (seed, searchParams) =>
    filterDays(seed, searchParams).map((day) => {
      const dayKey = normalizeDateValue(day.day || day.realized);
      const stats = cloneJson(day && day.stats, {});
      const trades = Array.isArray(day && day.trades) ? day.trades : [];
      const totalTrades = Number(stats.trades_count || trades.length || 0);
      const profit = Number(stats.net_profits || stats.profits || 0);
      const winners = Number(stats.winners || 0);
      const realizedR = trades.reduce(
        (total, trade) => total + Number(trade && trade.realized_rr || 0),
        0
      );
      const date = new Date(dayKey + "T00:00:00.000Z");
      const dayOfMonth = date.getUTCDate();
      const firstWeekday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay();
      const weekNumber = Math.ceil((dayOfMonth + firstWeekday) / 7);
      const isBreakeven = totalTrades > 0 && profit === 0;
      let backgroundColor = "#f1f3f4";

      if (profit > 0) {
        backgroundColor = "#BDE4C2";
      } else if (profit < 0) {
        backgroundColor = "#EAA5A7";
      }

      return {
        id: String(day.id || dayKey),
        title: "",
        day: dayKey,
        date: dayKey,
        realized: day.realized || dayKey,
        start: dayKey,
        end: dayKey,
        allDay: true,
        backgroundColor,
        borderColor: backgroundColor,
        textColor: "transparent",
        profits: profit,
        profit,
        pips: 0,
        points: 0,
        ticks: 0,
        r_value: realizedR,
        total_trades: totalTrades,
        trades_count: totalTrades,
        week_number: weekNumber,
        win_rate: totalTrades > 0 ? Math.round((winners / totalTrades) * 100) : 0,
        is_breakeven: isBreakeven,
        has_notes: Boolean(day && day.daily_note),
        daily_note: day && day.daily_note ? day.daily_note : null
      };
    });

  const createMaxCalendarEventDatePayload = (seed, searchParams) => {
    const days = filterDays(seed, searchParams)
      .map((day) => normalizeDateValue(day.day || day.realized))
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));

    return {
      max_date: days[0] || null
    };
  };

  const createMockResult = (input, method) => {
    const parsed = safeUrl(input);
    const path = parsed ? parsed.pathname : "";
    const normalizedPath = path.startsWith("/api/") ? path.slice(5) : path;
    const normalizedSegments = normalizedPath.split("/").filter(Boolean);
    const searchParams = parsed ? parsed.searchParams : new URLSearchParams();
    const seed = readBacktestSeed();
    const logType = getFilterValue(searchParams, "log_type");

    if (path.endsWith("/validate_token")) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          data: MOCK_USER
        }
      };
    }

    if (normalizedPath === "account/current_timezone") {
      return {
        status: 200,
        statusText: "OK",
        payload: MOCK_USER.time_zone
      };
    }

    if (normalizedPath === "account/index" || normalizedPath === "trading_accounts") {
      return {
        status: 200,
        statusText: "OK",
        payload: getSeedAccounts(seed)
      };
    }

    if (normalizedPath === "trading_charts/indicators") {
      return {
        status: 200,
        statusText: "OK",
        payload: null
      };
    }

    if (normalizedPath === "trading_charts/layouts") {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (
      normalizedSegments[0] === "trading_charts" &&
      normalizedSegments[1] === "layouts" &&
      normalizedSegments.length === 3
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: null
      };
    }

    if (normalizedPath === "chart_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: {}
      };
    }

    if (normalizedPath === "account/imports") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAccountImportsPayload(seed)
      };
    }

    if (normalizedPath === "account/max_calendar_event_date") {
      return {
        status: 200,
        statusText: "OK",
        payload: createMaxCalendarEventDatePayload(seed, searchParams)
      };
    }

    if (normalizedPath === "days/calendar_events") {
      return {
        status: 200,
        statusText: "OK",
        payload: createCalendarEventsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "new_reports/available") {
      return {
        status: 200,
        statusText: "OK",
        payload: createNewReportsAvailablePayload()
      };
    }

    if (normalizedPath === "new_reports/available_dimensions") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_AVAILABLE_REPORT_DIMENSIONS
      };
    }

    if (normalizedPath === "new_reports/differences") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          data: []
        }
      };
    }

    if (normalizedPath === "new_reports") {
      return {
        status: 200,
        statusText: "OK",
        payload: createNewReportsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "start_your_day") {
      return {
        status: 200,
        statusText: "OK",
        payload: createStartYourDayPayload(searchParams)
      };
    }

    if (
      normalizedPath === "notebook/folder_templates" ||
      normalizedPath.startsWith("notebook/folder_templates/")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (normalizedPath === "notebook/daily_notes") {
      return {
        status: 200,
        statusText: "OK",
        payload: createDailyNotePayload(searchParams)
      };
    }

    if (normalizedPath === "trades/all_symbols") {
      return {
        status: 200,
        statusText: "OK",
        payload: Array.from(
          new Set(getSeedTrades(seed).map((trade) => String(trade.symbol || "")))
        ).filter(Boolean)
      };
    }

    if (normalizedPath === "trades/running_pl") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeRunningPlPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/recent_trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeCollectionPayload(seed, "recentTrades")
      };
    }

    if (normalizedPath === "trades/present") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradesPresentPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/all_trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAllTradesPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/last_import") {
      return {
        status: 200,
        statusText: "OK",
        payload: createLastImportPayload(seed)
      };
    }

    if (normalizedPath === "trades/" || normalizedPath === "trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createDayViewPayload(seed, searchParams)
      };
    }

    if (
      normalizedSegments[0] === "trades" &&
      normalizedSegments.length === 2 &&
      normalizedSegments[1] !== "all_trades" &&
      normalizedSegments[1] !== "recent_trades" &&
      normalizedSegments[1] !== "present" &&
      normalizedSegments[1] !== "last_import"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeDetailPayload(seed, normalizedSegments[1])
      };
    }

    if (normalizedPath === "journal_stats/trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createWeekTradesPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "filters/account_balance_datum") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAccountBalanceDatumPayload(seed)
      };
    }

    if (normalizedPath === "filters/cumulative") {
      return {
        status: 200,
        statusText: "OK",
        payload: createCumulativePayload(seed)
      };
    }

    if (
      normalizedPath === "filters/dashboard_stats" ||
      normalizedPath === "filters/winrate"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createDashboardStatsPayload(seed)
      };
    }

    if (normalizedPath === "filters/stats") {
      return {
        status: 200,
        statusText: "OK",
        payload: createStatsPayload(seed)
      };
    }

    if (normalizedPath === "filters/performance") {
      return {
        status: 200,
        statusText: "OK",
        payload: createPerformancePayload(seed)
      };
    }

    if (normalizedPath === "filters/trade_stats") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeStatsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "zella_scores/current") {
      return {
        status: 200,
        statusText: "OK",
        payload: createZellaScorePayload(seed)
      };
    }

    if (normalizedPath === "user/get_onboarding") {
      return {
        status: 200,
        statusText: "OK",
        payload: createOnboardingPayload()
      };
    }

    if (normalizedPath === "user/profile") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          ...MOCK_USER,
          updateProfile: false
        }
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "daily_journal_log_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_grid_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_view_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_BACKTESTING_VIEW_SETTINGS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "session_custom_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_SESSION_CUSTOM_SETTINGS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "daily_journal_log_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_grid_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_view_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_BACKTESTING_VIEW_SETTINGS
      };
    }

    if (normalizedPath === "user/get_trade_log_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (normalizedPath === "user/set_trade_log_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (normalizedPath === "user/get_trade_details_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_DETAILS_SETTINGS
      };
    }

    if (normalizedPath === "user/set_trade_details_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_DETAILS_SETTINGS
      };
    }

    if (normalizedPath === "user/set_session_custom_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_SESSION_CUSTOM_SETTINGS
      };
    }

    if (normalizedPath === "assist/day_start") {
      return {
        status: 200,
        statusText: "OK",
        payload: Boolean(seed && seed.days && seed.days.days && seed.days.days.length)
      };
    }

    if (normalizedPath === "balance_transactions") {
      return {
        status: 200,
        statusText: "OK",
        payload: createBalanceTransactionsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "balance_transactions/delete_all") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          success: true
        }
      };
    }

    if (
      normalizedPath === "account/check_initial_balance" ||
      normalizedPath === "/account/check_initial_balance"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createInitialBalancePayload(seed)
      };
    }

    if (normalizedPath === "settings/brokers") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_BROKER_OPTIONS
      };
    }

    if (normalizedPath === "broker_companies") {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (
      normalizedPath === "tag_categories" ||
      normalizedPath === "loading_states" ||
      normalizedPath === "insights" ||
      normalizedPath === "account/all_tags" ||
      normalizedPath === "import_progresses"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (normalizedPath === "account/delete") {
      return {
        status: 403,
        statusText: "Forbidden",
        payload: {
          message: "Local account cannot be deleted"
        }
      };
    }

    if (
      normalizedPath === "dashboard_templates" ||
      path.includes("/dashboard-layout") ||
      path.includes("/dashboard_layout") ||
      normalizedPath.includes("template")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          templates: [],
          selected_template: DEFAULT_DASHBOARD_TEMPLATE,
          top_widgets: DEFAULT_DASHBOARD_TEMPLATE.top_widgets,
          bottom_widgets: DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets
        }
      };
    }

    if (path.includes("/notification")) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          count: 0,
          data: []
        }
      };
    }

    if (
      path.includes("/sessions") ||
      path.includes("/accounts") ||
      path.includes("/playbooks") ||
      path.includes("/strategy") ||
      path.includes("/tags") ||
      path.includes("/brokers") ||
      path.includes("/folders")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (method !== "GET") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          id: "copytrade-local-record",
          success: true
        }
      };
    }

    return {
      status: 200,
      statusText: "OK",
      payload: cloneDefaultDashboardResponse()
    };
  };

  const createMarketDataMockResult = (input, method) => {
    const parsed = safeUrl(input);
    const normalizedPath = parsed ? parsed.pathname.replace(/^\\/+/, "") : "";

    if (normalizedPath === "finhub/calendar/economic") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          economicCalendar: []
        }
      };
    }

    if (normalizedPath === "finhub/country") {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (method !== "GET") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          success: true
        }
      };
    }

    return {
      status: 200,
      statusText: "OK",
      payload: {}
    };
  };

  const createMockResponse = (input, method) => {
    const mockResult = isMarketDataProxyRequest(input)
      ? createMarketDataMockResult(input, method)
      : createMockResult(input, method);
    const headers = {
      "content-type": "application/json; charset=utf-8",
      ...AUTH_HEADERS
    };

    return {
      status: mockResult.status,
      statusText: mockResult.statusText,
      headers,
      responseText: JSON.stringify(mockResult.payload)
    };
  };

  const KORRA_SETTINGS_STORAGE_KEY = "korra-settings";
  const KORRA_COPYTRADE_LABELS_STORAGE_KEY = "korra-copytrade-account-labels";
  const KORRA_COPYTRADE_PRESETS_STORAGE_KEY = "korra-copytrade-setting-presets";
  const KORRA_COPYTRADE_ACCOUNT_PRESET_STORAGE_KEY = "korra-copytrade-account-preset-map";
  const KORRA_COPYTRADE_CREDENTIAL_PREFIX = "korra-copytrade-credential:";
  const COPYTRADE_BRIDGE_ACCOUNT_COLOR = "#2563eb";
  const COPYTRADE_BRIDGE_BROKER = "mt5";
  const COPYTRADE_BRIDGE_BROKER_NAME = "MetaTrader 5";
  const COPYTRADE_BRIDGE_DEFAULTS = {
    symbol: "XAUUSD",
    timeframe: "15m",
    lot: 0.01,
    aggressive: true,
    chunkBars: 24,
    dollarsPerMove: 25,
    tpDollars: 1000,
    slDollars: 1000,
    maxConcurrentTrades: 1,
    stopMode: 0,
    breakEvenTriggerPct: 50,
    trailingStartPct: 50,
    trailingDistPct: 30
  };

  const isObjectRecord = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const parseJsonSafe = (value, fallback = null) => {
    if (typeof value !== "string") {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const parseRequestBody = (body) => {
    if (body == null) {
      return null;
    }

    if (typeof body === "string") {
      const trimmed = body.trim();
      if (!trimmed) {
        return null;
      }

      const parsed = parseJsonSafe(trimmed, null);
      return parsed === null ? trimmed : parsed;
    }

    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return Object.fromEntries(body.entries());
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const entries = {};
      body.forEach((value, key) => {
        if (key in entries) {
          const previous = entries[key];
          entries[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
          return;
        }
        entries[key] = value;
      });
      return entries;
    }

    if (isObjectRecord(body)) {
      return body;
    }

    return null;
  };

  const toIsoStringOrNull = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    try {
      return new Date(numeric).toISOString();
    } catch {
      return null;
    }
  };

  const normalizeCopyTradeTimeframe = (value) => {
    const allowed = new Set(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);
    const candidate = typeof value === "string" ? value.trim() : "";
    return allowed.has(candidate) ? candidate : COPYTRADE_BRIDGE_DEFAULTS.timeframe;
  };

  const normalizeSymbol = (value) => {
    const fallback = COPYTRADE_BRIDGE_DEFAULTS.symbol;
    if (typeof value !== "string") {
      return fallback;
    }

    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    return normalized || fallback;
  };

  const toFiniteNumber = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const clampNumber = (value, min, max, fallback) => {
    const numeric = toFiniteNumber(value, fallback);
    return Math.min(max, Math.max(min, numeric));
  };

  const readCopyTradeAccountLabels = () => {
    try {
      const raw = localStorage.getItem(KORRA_COPYTRADE_LABELS_STORAGE_KEY);
      const parsed = parseJsonSafe(raw, {});
      return isObjectRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeCopyTradeAccountLabels = (nextLabels) => {
    try {
      localStorage.setItem(KORRA_COPYTRADE_LABELS_STORAGE_KEY, JSON.stringify(nextLabels));
    } catch {
      // Ignore storage failures for optional display labels.
    }
  };

  const setCopyTradeAccountLabel = (accountId, label) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return;
    }

    const nextLabels = { ...readCopyTradeAccountLabels() };
    const normalizedLabel = String(label || "").trim();

    if (normalizedLabel) {
      nextLabels[normalizedAccountId] = normalizedLabel;
    } else {
      delete nextLabels[normalizedAccountId];
    }

    writeCopyTradeAccountLabels(nextLabels);
  };

  const deleteCopyTradeAccountLabel = (accountId) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return;
    }

    const nextLabels = { ...readCopyTradeAccountLabels() };
    delete nextLabels[normalizedAccountId];
    writeCopyTradeAccountLabels(nextLabels);
  };

  const getCopyTradeAccountLabel = (accountId) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return "";
    }

    const labels = readCopyTradeAccountLabels();
    const raw = labels[normalizedAccountId];
    return typeof raw === "string" ? raw.trim() : "";
  };

  const normalizeCopyTradePresetPayload = (value) => {
    const source = isObjectRecord(value) ? value : {};
    return {
      symbol: normalizeSymbol(source.symbol),
      timeframe: normalizeCopyTradeTimeframe(source.timeframe),
      lot: String(clampNumber(source.lot, 0.01, 100, COPYTRADE_BRIDGE_DEFAULTS.lot)),
      tpDollars: String(
        clampNumber(source.tpDollars, 1, 1000000, COPYTRADE_BRIDGE_DEFAULTS.tpDollars)
      ),
      slDollars: String(
        clampNumber(source.slDollars, 1, 1000000, COPYTRADE_BRIDGE_DEFAULTS.slDollars)
      ),
      maxConcurrentTrades: String(
        Math.max(
          1,
          Math.min(
            10,
            Math.trunc(
              clampNumber(
                source.maxConcurrentTrades,
                1,
                10,
                COPYTRADE_BRIDGE_DEFAULTS.maxConcurrentTrades
              )
            )
          )
        )
      )
    };
  };

  const buildCopyTradeAccountSettingsDraft = (account) => {
    const source = isObjectRecord(account) ? account : {};
    return normalizeCopyTradePresetPayload({
      symbol: source.symbol,
      timeframe: source.timeframe,
      lot: source.lot,
      tpDollars: source.tpDollars,
      slDollars: source.slDollars,
      maxConcurrentTrades: source.maxConcurrentTrades
    });
  };

  const readCopyTradeSettingPresets = () => {
    try {
      const raw = localStorage.getItem(KORRA_COPYTRADE_PRESETS_STORAGE_KEY);
      const parsed = parseJsonSafe(raw, {});
      if (!isObjectRecord(parsed)) {
        return {};
      }

      const nextPresets = {};
      Object.keys(parsed).forEach((key) => {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return;
        }

        nextPresets[normalizedKey] = normalizeCopyTradePresetPayload(parsed[normalizedKey]);
      });
      return nextPresets;
    } catch {
      return {};
    }
  };

  const writeCopyTradeSettingPresets = (nextPresets) => {
    try {
      localStorage.setItem(KORRA_COPYTRADE_PRESETS_STORAGE_KEY, JSON.stringify(nextPresets));
    } catch {
      // Ignore optional preset persistence failures.
    }
  };

  const readCopyTradeAccountPresetAssignments = () => {
    try {
      const raw = localStorage.getItem(KORRA_COPYTRADE_ACCOUNT_PRESET_STORAGE_KEY);
      const parsed = parseJsonSafe(raw, {});
      return isObjectRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeCopyTradeAccountPresetAssignments = (nextAssignments) => {
    try {
      localStorage.setItem(
        KORRA_COPYTRADE_ACCOUNT_PRESET_STORAGE_KEY,
        JSON.stringify(nextAssignments)
      );
    } catch {
      // Ignore optional preset assignment persistence failures.
    }
  };

  const getCopyTradeAccountPresetAssignment = (accountId) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return "";
    }

    const assignments = readCopyTradeAccountPresetAssignments();
    return String(assignments[normalizedAccountId] || "").trim();
  };

  const setCopyTradeAccountPresetAssignment = (accountId, presetName) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return;
    }

    const assignments = { ...readCopyTradeAccountPresetAssignments() };
    const normalizedPresetName = String(presetName || "").trim();

    if (normalizedPresetName) {
      assignments[normalizedAccountId] = normalizedPresetName;
    } else {
      delete assignments[normalizedAccountId];
    }

    writeCopyTradeAccountPresetAssignments(assignments);
  };

  const readKorraSettings = () => {
    try {
      const raw = localStorage.getItem(KORRA_SETTINGS_STORAGE_KEY);
      const parsed = parseJsonSafe(raw, {});
      return isObjectRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const collectCopyTradeBridgeSettings = () => {
    const settings = readKorraSettings();
    return {
      symbol:
        typeof settings.selectedSymbol === "string" && settings.selectedSymbol.trim()
          ? settings.selectedSymbol.trim()
          : COPYTRADE_BRIDGE_DEFAULTS.symbol,
      timeframe: normalizeCopyTradeTimeframe(
        typeof settings.selectedBacktestTimeframe === "string" &&
          settings.selectedBacktestTimeframe.trim()
          ? settings.selectedBacktestTimeframe
          : settings.selectedTimeframe
      ),
      lot: clampNumber(settings.lot, 0.01, 100, COPYTRADE_BRIDGE_DEFAULTS.lot),
      aggressive:
        typeof settings.aggressive === "boolean"
          ? settings.aggressive
          : COPYTRADE_BRIDGE_DEFAULTS.aggressive,
      chunkBars: clampNumber(
        settings.chunkBars,
        8,
        180,
        COPYTRADE_BRIDGE_DEFAULTS.chunkBars
      ),
      dollarsPerMove: clampNumber(
        settings.dollarsPerMove,
        1,
        5000,
        COPYTRADE_BRIDGE_DEFAULTS.dollarsPerMove
      ),
      tpDollars: clampNumber(
        settings.tpDollars,
        1,
        100000,
        COPYTRADE_BRIDGE_DEFAULTS.tpDollars
      ),
      slDollars: clampNumber(
        settings.slDollars,
        1,
        100000,
        COPYTRADE_BRIDGE_DEFAULTS.slDollars
      ),
      maxConcurrentTrades: clampNumber(
        settings.maxConcurrentTrades,
        1,
        50,
        COPYTRADE_BRIDGE_DEFAULTS.maxConcurrentTrades
      ),
      stopMode: clampNumber(
        Math.trunc(toFiniteNumber(settings.stopMode, COPYTRADE_BRIDGE_DEFAULTS.stopMode)),
        0,
        2,
        COPYTRADE_BRIDGE_DEFAULTS.stopMode
      ),
      breakEvenTriggerPct: clampNumber(
        settings.breakEvenTriggerPct,
        0,
        100,
        COPYTRADE_BRIDGE_DEFAULTS.breakEvenTriggerPct
      ),
      trailingStartPct: clampNumber(
        settings.trailingStartPct,
        0,
        100,
        COPYTRADE_BRIDGE_DEFAULTS.trailingStartPct
      ),
      trailingDistPct: clampNumber(
        settings.trailingDistPct,
        0,
        100,
        COPYTRADE_BRIDGE_DEFAULTS.trailingDistPct
      )
    };
  };

  const buildCopyTradeAccountPayload = (rawFormData) => {
    const formData = isObjectRecord(rawFormData) ? rawFormData : {};
    const login = String(formData.login || "").trim();
    const password = typeof formData.password === "string" ? formData.password : "";
    const server = String(formData.server || formData.server_id || "").trim();

    return {
      login,
      password,
      server,
      provider: "metaapi",
      ...collectCopyTradeBridgeSettings()
    };
  };

  const requestLocalJson = async (path, init = {}) => {
    if (!nativeFetch) {
      throw new Error("Native fetch is unavailable in this browser.");
    }

    const requestInit = isObjectRecord(init) ? init : {};
    const timeoutMs = Number(requestInit.timeoutMs || 0);
    const requestHeaders = isObjectRecord(requestInit.headers) ? requestInit.headers : {};
    const fetchInit = { ...requestInit };
    delete fetchInit.timeoutMs;

    const controller =
      timeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller && timeoutMs > 0
        ? window.setTimeout(() => {
            controller.abort();
          }, timeoutMs)
        : 0;

    try {
      const response = await nativeFetch(path, {
        cache: "no-store",
        credentials: "same-origin",
        ...fetchInit,
        signal: controller ? controller.signal : fetchInit.signal,
        headers: {
          Accept: "application/json",
          ...requestHeaders
        }
      });

      const responseText = await response.text();
      const payload = responseText ? parseJsonSafe(responseText, responseText) : null;

      if (!response.ok) {
        const message =
          payload &&
          isObjectRecord(payload) &&
          typeof payload.error === "string" &&
          payload.error.trim()
            ? payload.error.trim()
            : responseText || "Request failed.";
        throw new Error(message);
      }

      return payload;
    } catch (error) {
      if (controller && controller.signal.aborted) {
        throw new Error("Request timed out. Please try again.");
      }

      throw error;
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const readCopyTradeCredentialDraft = (credentialId) => {
    try {
      const raw = sessionStorage.getItem(KORRA_COPYTRADE_CREDENTIAL_PREFIX + credentialId);
      const parsed = parseJsonSafe(raw, null);
      return isObjectRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeCopyTradeCredentialDraft = (credentialId, payload) => {
    try {
      sessionStorage.setItem(
        KORRA_COPYTRADE_CREDENTIAL_PREFIX + credentialId,
        JSON.stringify(payload)
      );
    } catch {
      // Ignore storage failures for short-lived bridge state.
    }
  };

  const clearCopyTradeCredentialDraft = (credentialId) => {
    try {
      sessionStorage.removeItem(KORRA_COPYTRADE_CREDENTIAL_PREFIX + credentialId);
    } catch {
      // Ignore storage failures for short-lived bridge state.
    }
  };

  const getInlineMt5ConnectState = () => {
    if (!window.__korraInlineMt5ConnectState) {
      window.__korraInlineMt5ConnectState = {
        pending: false,
        accountId: "",
        error: "",
        success: "",
        startedAt: 0
      };
    }

    return window.__korraInlineMt5ConnectState;
  };

  const clearInlineMt5ConnectState = () => {
    const state = getInlineMt5ConnectState();
    state.pending = false;
    state.accountId = "";
    state.error = "";
    state.success = "";
    state.startedAt = 0;
  };

  const delay = (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const buildCopyTradeDisplayName = (account) => {
    const savedLabel = getCopyTradeAccountLabel(account && account.id);
    if (savedLabel) {
      return savedLabel;
    }

    const login = String((account && account.login) || "").trim();
    const server = String((account && account.server) || "").trim();
    if (login && server) {
      return "MT5 " + login + " @ " + server;
    }

    if (login) {
      return "MT5 " + login;
    }

    return COPYTRADE_BRIDGE_BROKER_NAME;
  };

  const mapCopyTradeAccountToTradezellaAccount = (account, worker) => {
    const displayName = buildCopyTradeDisplayName(account);
    const heartbeatMs = Number(account && account.lastHeartbeatAt);
    const workerLoopMs = Number(worker && worker.loopMs);
    const nextHeartbeatIso =
      Number.isFinite(heartbeatMs) &&
      heartbeatMs > 0 &&
      Number.isFinite(workerLoopMs) &&
      workerLoopMs > 0 &&
      !account.paused
        ? new Date(heartbeatMs + workerLoopMs).toISOString()
        : null;
    const lastSyncIso =
      toIsoStringOrNull(heartbeatMs) ||
      toIsoStringOrNull(account && account.lastActionAt) ||
      toIsoStringOrNull(account && account.updatedAt) ||
      toIsoStringOrNull(account && account.createdAt);
    const status = String((account && account.status) || "");
    const failed = status === "Error";
    const syncDisconnected = !account.paused && status !== "Connected";
    const hasOpenPosition = Boolean(account && account.openPosition);

    return {
      id: String(account.id),
      account_public_uid: String(account.id),
      account_name: displayName,
      name: displayName,
      account_type: "live",
      archived: false,
      active: !account.paused,
      backtesting: false,
      trades_editable: true,
      read_only: false,
      count: hasOpenPosition ? 1 : 0,
      running_balance: 0,
      import_type: "auto_sync",
      broker: COPYTRADE_BRIDGE_BROKER,
      external_account_id: String(account.id),
      external_account_failed: failed,
      clear_in_progress: false,
      sync_disconnected: syncDisconnected,
      disabled: false,
      failed,
      can_resync: false,
      next_manual_resync_time: null,
      next_sync_time: nextHeartbeatIso,
      last_sync_time: lastSyncIso,
      last_sync_for_broker: lastSyncIso,
      has_trades: hasOpenPosition,
      has_performance_report: false,
      profit_calculation_method: "fifo",
      shared: false,
      primary: true,
      color: COPYTRADE_BRIDGE_ACCOUNT_COLOR,
      trades_count: hasOpenPosition ? 1 : 0,
      account_size: 0,
      last_import: null,
      last_imported_at: lastSyncIso,
      imports: [],
      broker_name: COPYTRADE_BRIDGE_BROKER_NAME,
      display_broker_name: COPYTRADE_BRIDGE_BROKER_NAME,
      created_at: toIsoStringOrNull(account && account.createdAt) || MOCK_USER.created_at,
      updated_at: toIsoStringOrNull(account && account.updatedAt) || MOCK_USER.created_at,
      display_currency: MOCK_USER.display_currency,
      time_zone: MOCK_USER.time_zone,
      user_public_uid: MOCK_USER.public_uid
    };
  };

  const buildCombinedTradezellaAccounts = async () => {
    const seed = readBacktestSeed();
    const seedAccounts = getSeedAccounts(seed);

    try {
      const copyTradePayload = await requestLocalJson("/api/copytrade/accounts");
      const liveAccounts = Array.isArray(copyTradePayload && copyTradePayload.accounts)
        ? copyTradePayload.accounts
        : [];
      const mappedAccounts = liveAccounts.map((account) =>
        mapCopyTradeAccountToTradezellaAccount(account, copyTradePayload && copyTradePayload.worker)
      );
      const seenIds = new Set(mappedAccounts.map((account) => String(account.id)));

      return [
        ...mappedAccounts,
        ...seedAccounts.filter((account) => !seenIds.has(String(account.id)))
      ];
    } catch {
      return seedAccounts;
    }
  };

  const findCopyTradeAccountById = (accounts, accountId) =>
    accounts.find((account) => String(account && account.id) === String(accountId || "")) || null;

  const findCopyTradeAccountByCredentials = (accounts, login, server) => {
    const normalizedLogin = String(login || "").trim();
    const normalizedServer = String(server || "").trim().toLowerCase();

    return (
      accounts.find(
        (account) =>
          String(account && account.login).trim() === normalizedLogin &&
          String(account && account.server).trim().toLowerCase() === normalizedServer
      ) || null
    );
  };

  const buildMt5ServerSearchResult = (bodyPayload) => {
    const body = isObjectRecord(bodyPayload) ? bodyPayload : {};
    const candidates = [
      body.id,
      body.search,
      body.server,
      body.server_id,
      body.marketing_name
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(candidates));

    return {
      servers: unique.map((value) => ({
        id: value,
        name: value
      }))
    };
  };

  const buildMt5CredentialPopupUrl = (broker) =>
    window.location.origin +
    "/connect-to-broker/callback/" +
    encodeURIComponent(broker) +
    "?bridge=korra";

  const buildMt5BrokerAccountCandidates = async (draft) => {
    const draftPayload = isObjectRecord(draft) ? draft : {};
    const formData = isObjectRecord(draftPayload.formData) ? draftPayload.formData : {};
    const login = String(formData.login || "").trim();
    const server = String(formData.server || formData.server_id || "").trim();
    const requestedAccountId = String(formData.account_id || "").trim();

    if (!login || !server) {
      return [];
    }

    let accounts = [];
    try {
      const payload = await requestLocalJson("/api/copytrade/accounts");
      accounts = Array.isArray(payload && payload.accounts) ? payload.accounts : [];
    } catch {
      accounts = [];
    }

    const matchingAccount =
      findCopyTradeAccountById(accounts, requestedAccountId) ||
      findCopyTradeAccountByCredentials(accounts, login, server);
    const existed = Boolean(requestedAccountId) || Boolean(matchingAccount);
    const externalId =
      requestedAccountId ||
      (matchingAccount ? String(matchingAccount.id) : COPYTRADE_BRIDGE_BROKER + ":" + login + "@" + server);
    const displayName = matchingAccount
      ? buildCopyTradeDisplayName(matchingAccount)
      : "MT5 " + login;

    return [
      {
        id: externalId,
        external_id: externalId,
        name: displayName,
        full_name: login + " @ " + server,
        existed,
        broker: COPYTRADE_BRIDGE_BROKER
      }
    ];
  };

  const upsertMt5CopyTradeAccount = async (formData, options = {}) => {
    const nextPayload = {
      ...buildCopyTradeAccountPayload(formData),
      ...(options && typeof options.provider === "string" ? { provider: options.provider } : {})
    };

    if (!nextPayload.login || !nextPayload.password || !nextPayload.server) {
      throw new Error("TradeCopier requires MT5 login, password, and server.");
    }

    const copyTradePayload = await requestLocalJson("/api/copytrade/accounts");
    const accounts = Array.isArray(copyTradePayload && copyTradePayload.accounts)
      ? copyTradePayload.accounts
      : [];
    const requestedAccountId = String((formData && formData.account_id) || "").trim();
    const accountToUpdate =
      findCopyTradeAccountById(accounts, requestedAccountId) ||
      findCopyTradeAccountByCredentials(accounts, nextPayload.login, nextPayload.server);

    if (accountToUpdate) {
      const updated = await requestLocalJson(
        "/api/copytrade/accounts/" + encodeURIComponent(String(accountToUpdate.id)),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(nextPayload)
        }
      );
      return updated && updated.account ? updated.account : accountToUpdate;
    }

    const created = await requestLocalJson("/api/copytrade/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextPayload)
    });

    return created && created.account ? created.account : null;
  };

  const buildMockResponse = (result) => ({
    status: result.status,
    statusText: result.statusText,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...AUTH_HEADERS
    },
    responseText: JSON.stringify(result.payload)
  });

  const resolveTradezellaBridgeResult = async (input, method, body) => {
    const parsed = safeUrl(input);
    const path = parsed ? parsed.pathname : "";
    const normalizedPath = path.startsWith("/api/") ? path.slice(5) : path;
    const normalizedSegments = normalizedPath.split("/").filter(Boolean);
    const bodyPayload = parseRequestBody(body);

    const toErrorResult = (error, fallbackStatus = 400) => ({
      status: fallbackStatus,
      statusText: fallbackStatus >= 500 ? "Internal Server Error" : "Bad Request",
      payload: {
        error: String((error && error.message) || error || "Something went wrong.")
      }
    });

    try {
      if (normalizedPath === "account/index" || normalizedPath === "trading_accounts") {
        return {
          status: 200,
          statusText: "OK",
          payload: await buildCombinedTradezellaAccounts()
        };
      }

      if (normalizedPath === "account/update" && method === "POST" && isObjectRecord(bodyPayload)) {
        if (bodyPayload.id !== undefined && bodyPayload.name !== undefined) {
          setCopyTradeAccountLabel(bodyPayload.id, bodyPayload.name);
        }

        return {
          status: 200,
          statusText: "OK",
          payload: {
            success: true
          }
        };
      }

      if (normalizedPath === "account/delete" && method === "POST" && isObjectRecord(bodyPayload)) {
        const accountId = String(bodyPayload.id || "").trim();
        if (!accountId) {
          throw new Error("Missing copy-trade account id.");
        }

        await requestLocalJson("/api/copytrade/accounts/" + encodeURIComponent(accountId), {
          method: "DELETE"
        });
        deleteCopyTradeAccountLabel(accountId);

        return {
          status: 200,
          statusText: "OK",
          payload: {
            success: true
          }
        };
      }

      if (normalizedPath === "account/clear" && method === "POST") {
        return {
          status: 200,
          statusText: "OK",
          payload: {
            block: true,
            message: "Trade clearing is disabled for live copy-trade accounts."
          }
        };
      }

      if (normalizedPath === "account/transfer" && method === "POST") {
        return {
          status: 200,
          statusText: "OK",
          payload: {
            error: "Trade transfer is not supported for live copy-trade accounts."
          }
        };
      }

      if (normalizedPath === "api_syncs/metatrader/search_servers" && method === "POST") {
        return {
          status: 200,
          statusText: "OK",
          payload: buildMt5ServerSearchResult(bodyPayload)
        };
      }

      if (
        normalizedSegments[0] === "api_credentials" &&
        normalizedSegments.length === 2 &&
        method === "GET"
      ) {
        const broker = String(normalizedSegments[1] || "").trim().toLowerCase();
        if (broker === COPYTRADE_BRIDGE_BROKER) {
          return {
            status: 200,
            statusText: "OK",
            payload: {
              url: buildMt5CredentialPopupUrl(broker)
            }
          };
        }
      }

      if (
        normalizedPath === "api_credentials" &&
        method === "POST" &&
        isObjectRecord(bodyPayload) &&
        String(bodyPayload.broker || "").trim().toLowerCase() === COPYTRADE_BRIDGE_BROKER
      ) {
        const credentialId =
          "korra-mt5-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

        writeCopyTradeCredentialDraft(credentialId, {
          id: credentialId,
          broker: COPYTRADE_BRIDGE_BROKER,
          provider: "metaapi",
          formData: bodyPayload
        });

        return {
          status: 200,
          statusText: "OK",
          payload: {
            api_credential_id: credentialId
          }
        };
      }

      if (
        normalizedSegments[0] === "api_credentials" &&
        normalizedSegments.length === 3 &&
        normalizedSegments[2] === "show_draft_status" &&
        method === "GET"
      ) {
        const credentialId = String(normalizedSegments[1] || "");
        const draft = readCopyTradeCredentialDraft(credentialId);

        return {
          status: 200,
          statusText: "OK",
          payload: {
            draft: false,
            api_credential_id: credentialId,
            broker: draft && draft.broker ? draft.broker : COPYTRADE_BRIDGE_BROKER
          }
        };
      }

      if (
        normalizedSegments[0] === "api_credentials" &&
        normalizedSegments.length === 4 &&
        normalizedSegments[2] === "external_accounts" &&
        normalizedSegments[3] === "broker_accounts" &&
        method === "GET"
      ) {
        const credentialId = String(normalizedSegments[1] || "");
        const draft = readCopyTradeCredentialDraft(credentialId);

        return {
          status: 200,
          statusText: "OK",
          payload: await buildMt5BrokerAccountCandidates(draft)
        };
      }

      if (
        normalizedSegments[0] === "api_credentials" &&
        normalizedSegments.length === 3 &&
        normalizedSegments[2] === "external_accounts" &&
        method === "POST"
      ) {
        const credentialId = String(normalizedSegments[1] || "");
        const draft = readCopyTradeCredentialDraft(credentialId);
        const draftFormData =
          draft && isObjectRecord(draft.formData) ? draft.formData : {};
        const nextFormData = {
          ...draftFormData,
          ...(isObjectRecord(bodyPayload) ? bodyPayload : {})
        };

        await upsertMt5CopyTradeAccount(nextFormData, {
          provider: draft && typeof draft.provider === "string" ? draft.provider : undefined
        });
        clearCopyTradeCredentialDraft(credentialId);

        return {
          status: 200,
          statusText: "OK",
          payload: {
            success: true,
            message: "MT5 account linked successfully."
          }
        };
      }

      if (
        normalizedSegments[0] === "external_accounts" &&
        normalizedSegments.length === 2 &&
        method === "DELETE"
      ) {
        const accountId = String(normalizedSegments[1] || "").trim();
        if (!accountId) {
          throw new Error("Missing copy-trade account id.");
        }

        await requestLocalJson("/api/copytrade/accounts/" + encodeURIComponent(accountId), {
          method: "DELETE"
        });
        deleteCopyTradeAccountLabel(accountId);

        return {
          status: 200,
          statusText: "OK",
          payload: {
            success: true
          }
        };
      }

      if (
        normalizedSegments[0] === "external_accounts" &&
        normalizedSegments.length === 2 &&
        method === "PUT"
      ) {
        return {
          status: 200,
          statusText: "OK",
          payload: {
            success: true
          }
        };
      }
    } catch (error) {
      return toErrorResult(error);
    }

    return null;
  };

  const createAsyncMockResponse = async (input, method, body) => {
    if (isMarketDataProxyRequest(input)) {
      return createMockResponse(input, method);
    }

    const bridgeResult = await resolveTradezellaBridgeResult(input, method, body);
    if (bridgeResult) {
      return buildMockResponse(bridgeResult);
    }

    return createMockResponse(input, method);
  };

  const applyLocalAccountUiGuards = () => {
    const hiddenActionLabels = new Set([
      "Archive account",
      "Clear trades",
      "Transfer data"
    ]);

    document
      .querySelectorAll("button, a, li, [role='menuitem']")
      .forEach((node) => {
        const text = String(node.textContent || "").replace(/\\s+/g, " ").trim();
        if (text === "Delete account") {
          node.setAttribute("aria-disabled", "true");
          node.setAttribute("disabled", "true");
          if (node.style) {
            node.style.display = "none";
            node.style.pointerEvents = "none";
          }
        }

        if (hiddenActionLabels.has(text)) {
          node.setAttribute("aria-disabled", "true");
          node.setAttribute("disabled", "true");
          if (node.style) {
            node.style.display = "none";
            node.style.pointerEvents = "none";
          }
        }
      });

    const bodyText = String((document.body && document.body.textContent) || "");
    if (bodyText.includes("Delete account?")) {
      document.querySelectorAll("button").forEach((button) => {
        const text = String(button.textContent || "").replace(/\\s+/g, " ").trim();
        if (text === "Delete") {
          button.setAttribute("disabled", "true");
          button.style.pointerEvents = "none";
          button.style.opacity = "0.5";
        }
      });
    }

    if (!document.body || typeof NodeFilter === "undefined") {
      return;
    }

    const textWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    let currentTextNode = textWalker.nextNode();
    while (currentTextNode) {
      const originalValue = String(currentTextNode.nodeValue || "");
      let nextValue = originalValue;

      if (nextValue.includes("Investor Password (read-only)")) {
        nextValue = nextValue.replace(
          /Investor Password \(read-only\)/g,
          "Password"
        );
      }

      if (nextValue.includes("Input your Investor Password.")) {
        nextValue = nextValue.replace(
          /Input your Investor Password\./g,
          "Input your MT5 account password."
        );
      }

      if (nextValue.includes("This is your MetaTrader 5 read only password.")) {
        nextValue = nextValue.replace(
          /This is your MetaTrader 5 read only password\./g,
          "This is your MT5 account password."
        );
      }

      if (nextValue !== originalValue) {
        currentTextNode.nodeValue = nextValue;
      }

      currentTextNode = textWalker.nextNode();
    }
  };

  const normalizeNodeText = (value) =>
    String(value || "")
      .replace(/\\s+/g, " ")
      .trim();

  const COPYTRADER_IMPORT_ALIAS_ID = "korra-copytrader-import-alias";

  const getEmbeddedBodyText = () => normalizeNodeText(document.body && document.body.textContent);

  const isMt5ImportMethodScreen = () => {
    const bodyText = getEmbeddedBodyText();
    return bodyText.includes("Select Import Method") && bodyText.includes("MetaTrader 5");
  };

  const isMt5ConnectScreen = () => {
    const bodyText = getEmbeddedBodyText();
    return (
      bodyText.includes("Connect MetaTrader 5") &&
      (bodyText.includes("Input your MT5 account password") ||
        bodyText.includes("Input your Investor Password"))
    );
  };

  const shouldInterceptInlineMt5Connect = (url, features) => {
    return false;
  };

  const navigateToCopyTradeDashboard = () => {
    clearInlineMt5ConnectState();
    window.location.assign("/settings/account?view=list");
  };

  const queryInlineMt5FormControl = (selectors) => {
    const selectorList = Array.isArray(selectors) ? selectors : [];
    for (let index = 0; index < selectorList.length; index += 1) {
      const selector = selectorList[index];
      const node = document.querySelector(selector);
      if (
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ) {
        return node;
      }
    }

    return null;
  };

  const readInlineMt5ConnectFormData = () => {
    const serverInput = queryInlineMt5FormControl([
      "[data-testid='mt-server-autocomplete'] input",
      "[data-testid='mt-server-autocomplete'] textarea",
      "input[name='server-autocomplete']"
    ]);
    const loginInput = queryInlineMt5FormControl([
      "#investor_login",
      "input[name='investor_login']"
    ]);
    const passwordInput = queryInlineMt5FormControl([
      "#investor_password",
      "input[name='investor_password']"
    ]);
    const fromDateInput = queryInlineMt5FormControl([
      "#from_date",
      "input[name='from_date']"
    ]);
    const accountSelect = queryInlineMt5FormControl([
      "#broken-account-select",
      "select[name='account_id']",
      "input[name='account_id']"
    ]);
    const server = serverInput ? String(serverInput.value || "").trim() : "";
    const login = loginInput ? String(loginInput.value || "").trim() : "";
    const password = passwordInput ? String(passwordInput.value || "") : "";
    const accountId = accountSelect ? String(accountSelect.value || "").trim() : "";
    const fromDate = fromDateInput ? String(fromDateInput.value || "").trim() : "";

    return {
      server,
      server_id: server,
      login,
      password,
      account_id: accountId,
      from_date: fromDate
    };
  };

  const resolveInlineMt5ConnectFormData = () => {
    const providedFormData =
      typeof window.getConnectFormData === "function" ? window.getConnectFormData() : null;
    const formData = isObjectRecord(providedFormData) ? providedFormData : {};
    const pageFormData = readInlineMt5ConnectFormData();
    const server = pageFormData.server || String(formData.server || formData.server_id || "").trim();
    const login = pageFormData.login || String(formData.login || "").trim();
    const password =
      pageFormData.password || (typeof formData.password === "string" ? formData.password : "");
    const accountId = pageFormData.account_id || String(formData.account_id || "").trim();
    const fromDate = pageFormData.from_date || String(formData.from_date || "").trim();

    return {
      ...formData,
      server,
      server_id: String(formData.server_id || server || "").trim(),
      login,
      password,
      account_id: accountId,
      from_date: fromDate
    };
  };

  const runInlineMt5Connect = async (popupHandle) => {
    const state = getInlineMt5ConnectState();
    if (state.pending) {
      return;
    }

    const formData = resolveInlineMt5ConnectFormData();
    state.pending = true;
    state.accountId = "";
    state.error = "";
    state.success = "";
    state.startedAt = Date.now();
    queueEmbeddedUiRefresh();

    try {
      const account = await upsertMt5CopyTradeAccount(formData, {
        provider: "metaapi"
      });

      if (!account || !account.id) {
        throw new Error("Failed to connect the MT5 copy-trade account.");
      }

      state.accountId = String(account.id);
      queueEmbeddedUiRefresh();

      state.pending = false;
      state.error = "";
      state.success = "MT5 account connected successfully.";
      state.startedAt = 0;
      queueEmbeddedUiRefresh();

      if (popupHandle && typeof popupHandle.close === "function") {
        popupHandle.close();
      }

      window.setTimeout(() => {
        navigateToCopyTradeDashboard();
      }, 900);
    } catch (error) {
      state.pending = false;
      state.accountId = "";
      state.error = String((error && error.message) || error || "MT5 connection failed.");
      state.success = "";
      state.startedAt = 0;

      if (popupHandle && typeof popupHandle.close === "function") {
        popupHandle.close();
      }

      queueEmbeddedUiRefresh();
    }
  };

  const createInlineMt5PopupHandle = () => {
    let closed = false;
    const popupHandle = {
      focus() {
        return undefined;
      },
      close() {
        closed = true;
      }
    };

    Object.defineProperty(popupHandle, "closed", {
      enumerable: true,
      get() {
        return closed;
      }
    });

    Object.defineProperty(popupHandle, "location", {
      enumerable: true,
      get() {
        return "";
      },
      set(nextLocation) {
        if (closed) {
          return;
        }

        void runInlineMt5Connect(popupHandle, nextLocation);
      }
    });

    return popupHandle;
  };

  const findButtonByTextFragment = (fragment) =>
    Array.from(document.querySelectorAll("button")).find((button) =>
      normalizeNodeText(button.textContent).includes(fragment)
    ) || null;

  const normalizeMt5ImportMethodLayout = () => {
    if (!isMt5ImportMethodScreen()) {
      return;
    }

    const autoSyncButton = findButtonByTextFragment("Auto-sync");
    const fileUploadButton = findButtonByTextFragment("File upload");
    const addManuallyButton = findButtonByTextFragment("Add manually");

    if (
      !(autoSyncButton instanceof HTMLButtonElement) ||
      !(fileUploadButton instanceof HTMLButtonElement) ||
      !(addManuallyButton instanceof HTMLButtonElement)
    ) {
      return;
    }

    const cardsContainer =
      autoSyncButton.parentElement instanceof HTMLElement ? autoSyncButton.parentElement : null;
    if (!cardsContainer) {
      return;
    }

    cardsContainer.style.flexWrap = "wrap";
    cardsContainer.style.justifyContent = "center";
    cardsContainer.style.gap = "16px";

    [autoSyncButton, fileUploadButton, addManuallyButton].forEach((button) => {
      button.style.flex = "0 1 148px";
    });

    const aliasButton = cardsContainer.querySelector("#" + COPYTRADER_IMPORT_ALIAS_ID);
    if (aliasButton instanceof HTMLElement) {
      aliasButton.remove();
    }
  };

  const ensureInlineMt5ConnectFeedback = () => {
    if (!isMt5ConnectScreen()) {
      const staleFeedback = document.getElementById("korra-inline-mt5-feedback");
      if (staleFeedback) {
        staleFeedback.remove();
      }
      return;
    }

    const state = getInlineMt5ConnectState();
    const connectButton =
      Array.from(document.querySelectorAll("button")).find((button) => {
        const text = normalizeNodeText(button.textContent);
        return text === "Connect" || text === "Connecting...";
      }) || null;

    if (connectButton instanceof HTMLButtonElement) {
      if (connectButton.dataset.korraInlineMt5ClickBound !== "true") {
        connectButton.dataset.korraInlineMt5ClickBound = "true";
        connectButton.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }

            if (getInlineMt5ConnectState().pending) {
              return;
            }

            void runInlineMt5Connect();
          },
          true
        );
      }

      const connectForm = connectButton.closest("form");
      if (
        connectForm instanceof HTMLFormElement &&
        connectForm.dataset.korraInlineMt5SubmitBound !== "true"
      ) {
        connectForm.dataset.korraInlineMt5SubmitBound = "true";
        connectForm.addEventListener(
          "submit",
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }

            if (getInlineMt5ConnectState().pending) {
              return;
            }

            void runInlineMt5Connect();
          },
          true
        );
      }

      if (state.pending) {
        if (!connectButton.dataset.korraOriginalText) {
          connectButton.dataset.korraOriginalText =
            normalizeNodeText(connectButton.textContent) || "Connect";
        }

        connectButton.textContent = "Connecting...";
        connectButton.disabled = true;
        connectButton.dataset.korraInlineConnecting = "true";
      } else if (connectButton.dataset.korraInlineConnecting === "true") {
        connectButton.disabled = false;
        connectButton.textContent = connectButton.dataset.korraOriginalText || "Connect";
        delete connectButton.dataset.korraInlineConnecting;
      }
    }

    const feedbackHost =
      connectButton && connectButton.parentElement instanceof HTMLElement
        ? connectButton.parentElement
        : document.body;
    let feedback = document.getElementById("korra-inline-mt5-feedback");

    if (!state.pending && !state.error && !state.success) {
      if (feedback) {
        feedback.remove();
      }
      return;
    }

    if (!(feedback instanceof HTMLElement)) {
      feedback = document.createElement("div");
      feedback.id = "korra-inline-mt5-feedback";
      feedback.style.marginTop = "12px";
      feedback.style.padding = "12px 14px";
      feedback.style.borderRadius = "10px";
      feedback.style.fontSize = "13px";
      feedback.style.lineHeight = "1.5";
      feedbackHost.appendChild(feedback);
    }

    feedback.style.background = state.error ? "#fff5f5" : state.success ? "#f0fdf4" : "#eff6ff";
    feedback.style.border = state.error
      ? "1px solid #f5c2c7"
      : state.success
        ? "1px solid #bbf7d0"
        : "1px solid #bfdbfe";
    feedback.style.color = state.error ? "#991b1b" : state.success ? "#166534" : "#1e3a8a";
    feedback.textContent = state.pending
      ? "Connecting your MT5 account..."
      : state.success || state.error;
  };

  const hideInlineMt5ConnectNode = (node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    node.style.display = "none";
    node.style.pointerEvents = "none";
    node.setAttribute("aria-hidden", "true");
  };

  const findInlineMt5FieldContainer = (control, labelFragments = []) => {
    if (!(control instanceof HTMLElement)) {
      return null;
    }

    let current = control;
    const fragments = labelFragments.map((fragment) => String(fragment || "").toLowerCase());

    for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
      const text = normalizeNodeText(current.textContent).toLowerCase();
      const controlCount = current.querySelectorAll("input, textarea, select").length;
      const buttonCount = current.querySelectorAll("button").length;
      const matchesLabel = fragments.some((fragment) => fragment && text.includes(fragment));

      if ((matchesLabel && controlCount <= 2) || (controlCount === 1 && buttonCount === 0)) {
        return current;
      }

      current = current.parentElement;
    }

    return control.parentElement instanceof HTMLElement ? control.parentElement : null;
  };

  const simplifyInlineMt5ConnectLayout = () => {
    if (!isMt5ConnectScreen()) {
      return;
    }

    const hiddenTextFragments = [
      "Supported Asset Types:",
      "Linking MetaTrader 5",
      "MetaTrader 5 account will be linked",
      "MetaTrader 5 lets you import"
    ];

    Array.from(document.querySelectorAll("body *")).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      if (node.querySelector("input, textarea, select, button")) {
        return;
      }

      const text = normalizeNodeText(node.textContent);
      if (!text) {
        return;
      }

      if (hiddenTextFragments.some((fragment) => text.includes(fragment))) {
        hideInlineMt5ConnectNode(node);
      }
    });

    const serverInput = queryInlineMt5FormControl([
      "[data-testid='mt-server-autocomplete'] input",
      "[data-testid='mt-server-autocomplete'] textarea",
      "input[name='server-autocomplete']"
    ]);
    const loginInput = queryInlineMt5FormControl([
      "#investor_login",
      "input[name='investor_login']"
    ]);
    const passwordInput = queryInlineMt5FormControl([
      "#investor_password",
      "input[name='investor_password']"
    ]);
    const fromDateInput = queryInlineMt5FormControl([
      "#from_date",
      "input[name='from_date']"
    ]);
    const connectButton =
      Array.from(document.querySelectorAll("button")).find((button) => {
        const text = normalizeNodeText(button.textContent);
        return text === "Connect" || text === "Connecting...";
      }) || null;

    const fieldContainers = [
      findInlineMt5FieldContainer(serverInput, ["server"]),
      findInlineMt5FieldContainer(loginInput, ["login"]),
      findInlineMt5FieldContainer(passwordInput, ["password"])
    ].filter((node) => node instanceof HTMLElement);

    const connectContainer =
      connectButton instanceof HTMLButtonElement
        ? findCommonAncestor([connectButton]) || connectButton.parentElement
        : null;
    const fromDateContainer = findInlineMt5FieldContainer(fromDateInput, ["start date"]);

    if (fromDateContainer instanceof HTMLElement) {
      hideInlineMt5ConnectNode(fromDateContainer);
    }

    const layoutNodes = [
      ...fieldContainers,
      connectContainer instanceof HTMLElement ? connectContainer : null
    ].filter((node) => node instanceof HTMLElement);
    const layoutHost =
      layoutNodes.length > 0
        ? findCommonAncestor(layoutNodes) || layoutNodes[0].parentElement
        : null;

    if (layoutHost instanceof HTMLElement) {
      layoutHost.style.width = "100%";
      layoutHost.style.maxWidth = "420px";
      layoutHost.style.margin = "56px auto 0";
      layoutHost.style.display = "grid";
      layoutHost.style.gap = "12px";
      layoutHost.style.alignItems = "stretch";
    }

    fieldContainers.forEach((container) => {
      if (!(container instanceof HTMLElement)) {
        return;
      }

      container.style.width = "100%";
      container.style.margin = "0";
      container.style.maxWidth = "none";
    });

    if (connectContainer instanceof HTMLElement) {
      connectContainer.style.width = "100%";
      connectContainer.style.margin = "4px 0 0";
    }

    if (connectButton instanceof HTMLButtonElement) {
      connectButton.style.width = "100%";
      connectButton.style.justifyContent = "center";
      connectButton.style.margin = "0";
    }
  };

  const redirectBaseAddTradeLinksToMt5 = () => {
    if (window.location.pathname !== "/settings/account") {
      return;
    }

    document.querySelectorAll("a[href='/ftux-add-trade'], a[href='/ftux-add-trade/']").forEach((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.href = DIRECT_MT5_ADD_ACCOUNT_PATH;
      }
    });

    document.querySelectorAll("a[href='/add-trade'], a[href='/add-trade/']").forEach((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.href = DIRECT_MT5_ADD_ACCOUNT_PATH;
      }
    });

    Array.from(document.querySelectorAll("button, a")).forEach((node) => {
      const text = normalizeNodeText(node.textContent);
      if (
        text !== "Add Accounts" &&
        text !== "Add Account" &&
        text !== "Add trades" &&
        text !== "Add trade"
      ) {
        return;
      }

      if (node.dataset.korraDirectMt5Bound === "true") {
        return;
      }

      node.dataset.korraDirectMt5Bound = "true";
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }

          history.pushState(history.state, "", DIRECT_MT5_ADD_ACCOUNT_PATH);
          window.dispatchEvent(new PopStateEvent("popstate"));
        },
        true
      );
    });
  };

  const isCustomCopyTradeShellRoute = () => window.location.pathname === "/settings/account";

  const readCustomCopyTradeViewState = () => {
    const parsed = safeUrl(window.location.href);
    const params = parsed ? parsed.searchParams : null;
    const view = params ? String(params.get("view") || "").trim().toLowerCase() : "";
    const accountId = params ? String(params.get("accountId") || "").trim() : "";
    const providerAccountId = params ? String(params.get("providerAccountId") || "").trim() : "";

    if (view === KORRA_COPYTRADE_ADD_VIEW) {
      return {
        view: KORRA_COPYTRADE_ADD_VIEW,
        accountId: "",
        providerAccountId: ""
      };
    }

    if (view === KORRA_COPYTRADE_STATS_VIEW && (accountId || providerAccountId)) {
      return {
        view: KORRA_COPYTRADE_STATS_VIEW,
        accountId,
        providerAccountId
      };
    }

    return {
      view: KORRA_COPYTRADE_LIST_VIEW,
      accountId: "",
      providerAccountId: ""
    };
  };

  const navigateEmbeddedPath = (path) => {
    const nextPath = normalizeEmbeddedPath(path) || path;
    history.pushState(history.state, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const navigateToCustomCopyTradeHome = () => {
    navigateEmbeddedPath("/settings/account?view=list");
  };

  const navigateToCustomCopyTradeStatistics = (accountId, providerAccountId) => {
    const normalizedAccountId = String(accountId || "").trim();
    const normalizedProviderAccountId = String(providerAccountId || "").trim();
    if (!normalizedAccountId && !normalizedProviderAccountId) {
      return;
    }

    const nextPath =
      "/settings/account?view=" + encodeURIComponent(KORRA_COPYTRADE_STATS_VIEW);
    const accountQuery = normalizedAccountId
      ? "&accountId=" + encodeURIComponent(normalizedAccountId)
      : "";
    const providerAccountQuery = normalizedProviderAccountId
      ? "&providerAccountId=" + encodeURIComponent(normalizedProviderAccountId)
      : "";

    navigateEmbeddedPath(nextPath + accountQuery + providerAccountQuery);
  };

  const navigateToAddAccountFlow = () => {
    navigateEmbeddedPath(DIRECT_MT5_ADD_ACCOUNT_PATH);
  };

  const getCustomCopyTradeStore = () => {
    if (!isObjectRecord(window.__korraCustomCopyTradeStore)) {
      window.__korraCustomCopyTradeStore = {
        list: {
          loading: false,
          data: null,
          error: "",
          fetchedAt: 0,
          promise: null
        },
        details: {},
        accountForms: {},
        addForm: {
          server: "",
          login: "",
          password: "",
          pending: false,
          error: "",
          success: ""
        },
        summaryStream: {
          source: null,
          connected: false,
          lastEventAt: 0
        }
      };
    }

    const store = window.__korraCustomCopyTradeStore;
    if (!isObjectRecord(store.list)) {
      store.list = {
        loading: false,
        data: null,
        error: "",
        fetchedAt: 0,
        promise: null
      };
    }
    if (!isObjectRecord(store.details)) {
      store.details = {};
    }
    if (!isObjectRecord(store.accountForms)) {
      store.accountForms = {};
    }
    if (!isObjectRecord(store.addForm)) {
      store.addForm = {
        server: "",
        login: "",
        password: "",
        pending: false,
        error: "",
        success: ""
      };
    }
    if (!isObjectRecord(store.summaryStream)) {
      store.summaryStream = {
        source: null,
        connected: false,
        lastEventAt: 0
      };
    }

    return store;
  };

  const getCustomCopyTradeSummaryStreamState = () => {
    const store = getCustomCopyTradeStore();
    if (!isObjectRecord(store.summaryStream)) {
      store.summaryStream = {
        source: null,
        connected: false,
        lastEventAt: 0
      };
    }
    return store.summaryStream;
  };

  const upsertCustomCopyTradeSummaryItem = (payload, accountId, providerAccountId, summary) => {
    if (!isObjectRecord(payload)) {
      return false;
    }

    const normalizedAccountId = String(accountId || "").trim();
    const normalizedProviderAccountId = String(providerAccountId || "").trim();
    if (!normalizedAccountId && !normalizedProviderAccountId) {
      return false;
    }

    const nextItem = {
      accountId: normalizedAccountId,
      summary
    };
    const currentItems = Array.isArray(payload.summaries) ? payload.summaries.slice() : [];
    const itemIndex = currentItems.findIndex((item) => {
      if (!isObjectRecord(item)) {
        return false;
      }
      if (String(item.accountId || "").trim() === normalizedAccountId) {
        return true;
      }
      const itemProviderAccountId =
        item.summary && isObjectRecord(item.summary)
          ? String(item.summary.providerAccountId || "").trim()
          : "";
      return normalizedProviderAccountId && itemProviderAccountId === normalizedProviderAccountId;
    });

    if (itemIndex >= 0) {
      currentItems[itemIndex] = nextItem;
    } else {
      currentItems.push(nextItem);
    }

    payload.summaries = currentItems;
    return true;
  };

  const applyCustomCopyTradeLiveSummary = (payload) => {
    if (!isObjectRecord(payload)) {
      return;
    }

    const accountId = String(payload.accountId || "").trim();
    const providerAccountId = String(payload.providerAccountId || "").trim();
    const summary = isObjectRecord(payload.summary) ? payload.summary : null;

    if (!summary) {
      return;
    }

    const store = getCustomCopyTradeStore();
    let changed = false;

    if (isObjectRecord(store.list.data)) {
      changed =
        upsertCustomCopyTradeSummaryItem(store.list.data, accountId, providerAccountId, summary) ||
        changed;
    }

    const detailEntry = accountId ? getCustomCopyTradeDetailEntry(accountId) : null;
    if (
      detailEntry &&
      isObjectRecord(detailEntry.data) &&
      isObjectRecord(detailEntry.data.dashboard)
    ) {
      const dashboard = detailEntry.data.dashboard;
      dashboard.providerAccountId = String(summary.providerAccountId || providerAccountId || "");
      dashboard.login = String(summary.login || dashboard.login || "");
      dashboard.server = String(summary.server || dashboard.server || "");
      dashboard.broker = summary.broker ?? dashboard.broker ?? null;
      dashboard.currency = String(summary.currency || dashboard.currency || "USD");
      dashboard.balance = summary.balance ?? null;
      dashboard.equity = summary.equity ?? null;
      dashboard.tradeAllowed =
        typeof summary.tradeAllowed === "boolean" ? summary.tradeAllowed : null;
      dashboard.netOpenProfit = Number(summary.netOpenProfit || 0);
      dashboard.openPositionsCount = Number(summary.openPositionsCount || 0);
      dashboard.lastSyncedAt = Number(summary.lastSyncedAt || Date.now());
      changed = true;
    }

    if (changed) {
      queueEmbeddedUiRefresh();
    }
  };

  const ensureCustomCopyTradeSummaryStream = () => {
    if (typeof window.EventSource !== "function") {
      return;
    }

    const streamState = getCustomCopyTradeSummaryStreamState();
    if (streamState.source instanceof EventSource) {
      return;
    }

    const source = new EventSource("/api/copytrade/accounts/stream");
    streamState.source = source;
    streamState.connected = false;

    source.addEventListener("ready", () => {
      streamState.connected = true;
      streamState.lastEventAt = Date.now();
    });

    source.addEventListener("summary", (event) => {
      streamState.connected = true;
      streamState.lastEventAt = Date.now();

      try {
        const payload = JSON.parse(String(event.data || "{}"));
        applyCustomCopyTradeLiveSummary(payload);
      } catch {
        // Ignore malformed live updates and keep the snapshot flow active.
      }
    });

    source.addEventListener("idle", () => {
      streamState.connected = true;
      streamState.lastEventAt = Date.now();
    });

    source.onerror = () => {
      streamState.connected = false;
      if (source.readyState === EventSource.CLOSED && streamState.source === source) {
        streamState.source = null;
        window.setTimeout(() => {
          if (isCustomCopyTradeShellRoute()) {
            ensureCustomCopyTradeSummaryStream();
          }
        }, 3000);
      }
    };
  };

  const teardownCustomCopyTradeSummaryStream = () => {
    const streamState = getCustomCopyTradeSummaryStreamState();
    if (streamState.source instanceof EventSource) {
      streamState.source.close();
    }
    streamState.source = null;
    streamState.connected = false;
  };

  const getCustomCopyTradeAddFormState = () => {
    const store = getCustomCopyTradeStore();
    return store.addForm;
  };

  const getCustomCopyTradeAccountFormState = (accountId, account) => {
    const store = getCustomCopyTradeStore();
    const normalizedAccountId = String(accountId || "").trim();

    if (!normalizedAccountId) {
      return null;
    }

    if (!isObjectRecord(store.accountForms)) {
      store.accountForms = {};
    }

    const sourceUpdatedAt = Number(account && account.updatedAt) || 0;
    const defaultDraft = buildCopyTradeAccountSettingsDraft(account);
    const assignedPresetName = getCopyTradeAccountPresetAssignment(normalizedAccountId);
    const existing = isObjectRecord(store.accountForms[normalizedAccountId])
      ? store.accountForms[normalizedAccountId]
      : null;

    if (!existing) {
      store.accountForms[normalizedAccountId] = {
        ...defaultDraft,
        selectedPresetName: assignedPresetName,
        presetNameInput: assignedPresetName,
        pending: false,
        pausePending: false,
        reconnectPending: false,
        error: "",
        success: "",
        dirty: false,
        sourceUpdatedAt
      };
    } else if (
      sourceUpdatedAt &&
      Number(existing.sourceUpdatedAt || 0) !== sourceUpdatedAt &&
      !existing.dirty &&
      !existing.pending &&
      !existing.pausePending &&
      !existing.reconnectPending
    ) {
      Object.assign(existing, defaultDraft, {
        selectedPresetName: existing.selectedPresetName || assignedPresetName,
        presetNameInput:
          String(existing.presetNameInput || "").trim() ||
          existing.selectedPresetName ||
          assignedPresetName,
        sourceUpdatedAt
      });
    } else if (!String(existing.selectedPresetName || "").trim() && assignedPresetName) {
      existing.selectedPresetName = assignedPresetName;
      if (!String(existing.presetNameInput || "").trim()) {
        existing.presetNameInput = assignedPresetName;
      }
    }

    return store.accountForms[normalizedAccountId];
  };

  const getCustomCopyTradeDetailEntry = (accountId) => {
    const store = getCustomCopyTradeStore();
    const normalizedAccountId = String(accountId || "").trim();

    if (!normalizedAccountId) {
      return {
        loading: false,
        data: null,
        error: "",
        fetchedAt: 0,
        promise: null
      };
    }

    if (!isObjectRecord(store.details[normalizedAccountId])) {
      store.details[normalizedAccountId] = {
        loading: false,
        data: null,
        error: "",
        fetchedAt: 0,
        promise: null
      };
    }

    return store.details[normalizedAccountId];
  };

  const loadCustomCopyTradeList = (force = false) => {
    const store = getCustomCopyTradeStore();
    const listState = store.list;
    const now = Date.now();

    if (
      !force &&
      listState.data &&
      now - Number(listState.fetchedAt || 0) <= KORRA_COPYTRADE_LIST_CACHE_MS
    ) {
      return Promise.resolve(listState.data);
    }

    if (listState.promise) {
      return listState.promise;
    }

    listState.loading = true;
    listState.error = "";
    queueEmbeddedUiRefresh();

    const promise = requestLocalJson("/api/copytrade/accounts?includeSummary=1", {
      timeoutMs: 12000
    })
      .then((payload) => {
        listState.data = payload;
        listState.fetchedAt = Date.now();
        listState.error = "";
        if (isCustomCopyTradeShellRoute()) {
          teardownCustomCopyTradeSummaryStream();
          const routeState = readCustomCopyTradeViewState();
          if (routeState.view !== KORRA_COPYTRADE_ADD_VIEW) {
            ensureCustomCopyTradeSummaryStream();
          }
        }
        return payload;
      })
      .catch((error) => {
        listState.error = String((error && error.message) || error || "Failed to load accounts.");
        throw error;
      })
      .finally(() => {
        listState.loading = false;
        listState.promise = null;
        queueEmbeddedUiRefresh();
      });

    listState.promise = promise;
    return promise;
  };

  const loadCustomCopyTradeDashboard = (accountId, force = false) => {
    const entry = getCustomCopyTradeDetailEntry(accountId);
    const now = Date.now();

    if (
      !force &&
      entry.data &&
      now - Number(entry.fetchedAt || 0) <= KORRA_COPYTRADE_DETAIL_CACHE_MS
    ) {
      return Promise.resolve(entry.data);
    }

    if (entry.promise) {
      return entry.promise;
    }

    entry.loading = true;
    entry.error = "";
    queueEmbeddedUiRefresh();

    const promise = requestLocalJson(
      "/api/copytrade/accounts/" + encodeURIComponent(String(accountId || "")) + "/dashboard",
      {
        timeoutMs: 15000
      }
    )
      .then((payload) => {
        entry.data = payload;
        entry.fetchedAt = Date.now();
        entry.error = "";
        return payload;
      })
      .catch((error) => {
        entry.error = String(
          (error && error.message) || error || "Failed to load account statistics."
        );
        throw error;
      })
      .finally(() => {
        entry.loading = false;
        entry.promise = null;
        queueEmbeddedUiRefresh();
      });

    entry.promise = promise;
    return promise;
  };

  const syncCustomCopyTradeAccountIntoStore = (account) => {
    if (!isObjectRecord(account)) {
      return;
    }

    const normalizedAccountId = String(account.id || "").trim();
    if (!normalizedAccountId) {
      return;
    }

    const store = getCustomCopyTradeStore();
    if (
      isObjectRecord(store.list.data) &&
      Array.isArray(store.list.data.accounts)
    ) {
      store.list.data.accounts = store.list.data.accounts.map((candidate) =>
        String(candidate && candidate.id) === normalizedAccountId ? account : candidate
      );
    }

    const detailEntry = getCustomCopyTradeDetailEntry(normalizedAccountId);
    if (isObjectRecord(detailEntry.data)) {
      detailEntry.data.account = account;
    }
  };

  const buildCustomCopyTradeLoadingOverlayMarkup = (label) =>
    '<div class="korra-copytrade-shell__loadingOverlay">' +
    '<div class="korra-copytrade-shell__loadingCore">' +
    '<span class="korra-copytrade-shell__loadingSpinner" aria-hidden="true"></span>' +
    '<span class="korra-copytrade-shell__loadingText">' +
    escapeHtml(label || "Loading...") +
    "</span>" +
    "</div>" +
    "</div>";

  const updateCustomCopyTradeAccountFormField = (accountId, field, value) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState) {
      return;
    }

    const normalizedField = String(field || "").trim();
    if (
      normalizedField !== "selectedPresetName" &&
      normalizedField !== "presetNameInput" &&
      normalizedField !== "symbol" &&
      normalizedField !== "timeframe" &&
      normalizedField !== "lot" &&
      normalizedField !== "tpDollars" &&
      normalizedField !== "slDollars" &&
      normalizedField !== "maxConcurrentTrades"
    ) {
      return;
    }

    formState[normalizedField] = String(value == null ? "" : value);
    formState.error = "";
    formState.success = "";
    if (normalizedField !== "selectedPresetName" && normalizedField !== "presetNameInput") {
      formState.dirty = true;
    }
    queueEmbeddedUiRefresh();
  };

  const buildCopyTradeAccountPatchFromFormState = (formState) => {
    return {
      symbol: normalizeSymbol(formState.symbol),
      timeframe: normalizeCopyTradeTimeframe(formState.timeframe),
      lot: clampNumber(formState.lot, 0.01, 100, COPYTRADE_BRIDGE_DEFAULTS.lot),
      tpDollars: clampNumber(
        formState.tpDollars,
        1,
        1000000,
        COPYTRADE_BRIDGE_DEFAULTS.tpDollars
      ),
      slDollars: clampNumber(
        formState.slDollars,
        1,
        1000000,
        COPYTRADE_BRIDGE_DEFAULTS.slDollars
      ),
      maxConcurrentTrades: Math.max(
        1,
        Math.min(
          10,
          Math.trunc(
            clampNumber(
              formState.maxConcurrentTrades,
              1,
              10,
              COPYTRADE_BRIDGE_DEFAULTS.maxConcurrentTrades
            )
          )
        )
      )
    };
  };

  const applyCopyTradePresetToFormState = (accountId, presetName) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState) {
      return false;
    }

    const normalizedPresetName = String(presetName || "").trim();
    const presets = readCopyTradeSettingPresets();
    const preset = presets[normalizedPresetName];
    if (!preset) {
      formState.error = "Choose a saved settings preset first.";
      formState.success = "";
      queueEmbeddedUiRefresh();
      return false;
    }

    Object.assign(formState, preset, {
      selectedPresetName: normalizedPresetName,
      presetNameInput: normalizedPresetName,
      dirty: true,
      error: "",
      success: "Loaded " + normalizedPresetName + "."
    });
    setCopyTradeAccountPresetAssignment(accountId, normalizedPresetName);
    queueEmbeddedUiRefresh();
    return true;
  };

  const saveCopyTradePresetFromFormState = (accountId) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState) {
      return false;
    }

    const presetName = String(formState.presetNameInput || "").trim();
    if (!presetName) {
      formState.error = "Enter a preset name first.";
      formState.success = "";
      queueEmbeddedUiRefresh();
      return false;
    }

    const presets = {
      ...readCopyTradeSettingPresets(),
      [presetName]: normalizeCopyTradePresetPayload(buildCopyTradeAccountPatchFromFormState(formState))
    };
    writeCopyTradeSettingPresets(presets);
    setCopyTradeAccountPresetAssignment(accountId, presetName);
    formState.selectedPresetName = presetName;
    formState.presetNameInput = presetName;
    formState.error = "";
    formState.success = "Saved " + presetName + ".";
    queueEmbeddedUiRefresh();
    return true;
  };

  const saveCustomCopyTradeAccountSettings = async (accountId) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState || formState.pending) {
      return;
    }

    formState.pending = true;
    formState.error = "";
    formState.success = "";
    queueEmbeddedUiRefresh();

    try {
      const payload = buildCopyTradeAccountPatchFromFormState(formState);
      const response = await requestLocalJson(
        "/api/copytrade/accounts/" + encodeURIComponent(String(accountId || "")),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const account = response && response.account ? response.account : null;
      if (!account) {
        throw new Error("Failed to save account settings.");
      }

      syncCustomCopyTradeAccountIntoStore(account);
      formState.pending = false;
      formState.dirty = false;
      formState.sourceUpdatedAt = Number(account.updatedAt) || Date.now();
      formState.error = "";
      formState.success = "Settings saved.";
      if (String(formState.selectedPresetName || "").trim()) {
        setCopyTradeAccountPresetAssignment(accountId, formState.selectedPresetName);
      }
      void loadCustomCopyTradeList(true);
      queueEmbeddedUiRefresh();
    } catch (error) {
      formState.pending = false;
      formState.error = String((error && error.message) || error || "Failed to save settings.");
      formState.success = "";
      queueEmbeddedUiRefresh();
    }
  };

  const handleCustomCopyTradePresetSelection = async (accountId, presetName) => {
    const normalizedAccountId = String(accountId || "").trim();
    const formState = getCustomCopyTradeAccountFormState(normalizedAccountId, null);
    if (!normalizedAccountId || !formState) {
      return;
    }

    if (formState.pending || formState.pausePending || formState.reconnectPending) {
      return;
    }

    const normalizedPresetName = String(presetName || "").trim();
    formState.error = "";
    formState.success = "";

    if (!normalizedPresetName) {
      formState.selectedPresetName = "";
      formState.presetNameInput = "";
      formState.dirty = false;
      setCopyTradeAccountPresetAssignment(normalizedAccountId, "");
      formState.success = "Preset cleared.";
      queueEmbeddedUiRefresh();
      return;
    }

    formState.selectedPresetName = normalizedPresetName;
    formState.presetNameInput = normalizedPresetName;
    if (!applyCopyTradePresetToFormState(normalizedAccountId, normalizedPresetName)) {
      queueEmbeddedUiRefresh();
      return;
    }

    await saveCustomCopyTradeAccountSettings(normalizedAccountId);
  };

  const toggleCustomCopyTradeAccountPaused = async (accountId, paused) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState || formState.pausePending) {
      return;
    }

    formState.pausePending = true;
    formState.error = "";
    formState.success = "";
    queueEmbeddedUiRefresh();

    try {
      const response = await requestLocalJson(
        "/api/copytrade/accounts/" + encodeURIComponent(String(accountId || "")) + "/pause",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ paused })
        }
      );
      const account = response && response.account ? response.account : null;
      if (!account) {
        throw new Error("Failed to update account state.");
      }

      syncCustomCopyTradeAccountIntoStore(account);
      formState.pausePending = false;
      formState.success = paused ? "Account paused." : "Account resumed.";
      formState.error = "";
      void loadCustomCopyTradeList(true);
      void loadCustomCopyTradeDashboard(accountId, true);
      queueEmbeddedUiRefresh();
    } catch (error) {
      formState.pausePending = false;
      formState.error = String((error && error.message) || error || "Failed to update account.");
      formState.success = "";
      queueEmbeddedUiRefresh();
    }
  };

  const reconnectCustomCopyTradeAccount = async (accountId) => {
    const formState = getCustomCopyTradeAccountFormState(accountId, null);
    if (!formState || formState.reconnectPending) {
      return;
    }

    formState.reconnectPending = true;
    formState.error = "";
    formState.success = "";
    queueEmbeddedUiRefresh();

    try {
      const response = await requestLocalJson(
        "/api/copytrade/accounts/" + encodeURIComponent(String(accountId || "")),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "metaapi",
            forceProvision: true
          })
        }
      );
      const account = response && response.account ? response.account : null;
      if (!account) {
        throw new Error("Failed to reconnect account.");
      }

      syncCustomCopyTradeAccountIntoStore(account);
      formState.reconnectPending = false;
      formState.success = "Reconnect requested.";
      formState.error = "";
      void loadCustomCopyTradeList(true);
      void loadCustomCopyTradeDashboard(accountId, true);
      queueEmbeddedUiRefresh();
    } catch (error) {
      formState.reconnectPending = false;
      formState.error = String((error && error.message) || error || "Reconnect failed.");
      formState.success = "";
      queueEmbeddedUiRefresh();
    }
  };

  const resetCustomCopyTradeAddFormState = () => {
    const state = getCustomCopyTradeAddFormState();
    state.server = "";
    state.login = "";
    state.password = "";
    state.pending = false;
    state.error = "";
    state.success = "";
  };

  const updateCustomCopyTradeAddFormField = (field, value) => {
    const state = getCustomCopyTradeAddFormState();
    const nextField = String(field || "").trim();
    if (
      nextField !== "server" &&
      nextField !== "login" &&
      nextField !== "password"
    ) {
      return;
    }

    state[nextField] = String(value || "");
    state.error = "";
    state.success = "";
    queueEmbeddedUiRefresh();
  };

  const submitCustomCopyTradeAddForm = async () => {
    const state = getCustomCopyTradeAddFormState();
    if (state.pending) {
      return;
    }

    const server = String(state.server || "").trim();
    const login = String(state.login || "").trim();
    const password = String(state.password || "");

    if (!server || !login || !password) {
      state.error = "Server, login, and password are required.";
      state.success = "";
      queueEmbeddedUiRefresh();
      return;
    }

    state.pending = true;
    state.error = "";
    state.success = "";
    queueEmbeddedUiRefresh();

    try {
      await upsertMt5CopyTradeAccount(
        {
          server,
          server_id: server,
          login,
          password
        },
        {
          provider: "metaapi"
        }
      );

      state.pending = false;
      state.success = "MT5 account connected successfully.";
      state.password = "";
      const store = getCustomCopyTradeStore();
      if (isObjectRecord(store.list)) {
        store.list.data = null;
        store.list.error = "";
        store.list.fetchedAt = 0;
      }
      await loadCustomCopyTradeList(true);
      resetCustomCopyTradeAddFormState();
      navigateToCustomCopyTradeHome();
    } catch (error) {
      state.pending = false;
      state.error = String((error && error.message) || error || "MT5 connection failed.");
      state.success = "";
      queueEmbeddedUiRefresh();
    }
  };

  const deleteCustomCopyTradeAccount = async (accountId) => {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      throw new Error("Missing copy-trade account id.");
    }

    const confirmed = window.confirm("Delete this MT5 account?");
    if (!confirmed) {
      return false;
    }

    const store = getCustomCopyTradeStore();
    await requestLocalJson("/api/copytrade/accounts/" + encodeURIComponent(normalizedAccountId), {
      method: "DELETE"
    });
    deleteCopyTradeAccountLabel(normalizedAccountId);
    setCopyTradeAccountPresetAssignment(normalizedAccountId, "");

    if (isObjectRecord(store.details)) {
      delete store.details[normalizedAccountId];
    }
    if (isObjectRecord(store.accountForms)) {
      delete store.accountForms[normalizedAccountId];
    }

    if (isObjectRecord(store.list)) {
      store.list.data = null;
      store.list.error = "";
      store.list.fetchedAt = 0;
    }

    await loadCustomCopyTradeList(true).catch((error) => {
      if (isObjectRecord(store.list)) {
        store.list.error = String(
          (error && error.message) || error || "Failed to refresh accounts."
        );
      }
      throw error;
    });

    return true;
  };

  const escapeHtml = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatCurrencyValue = (value, currency = "USD") => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }

    const currencyCode = String(currency || "USD").trim().toUpperCase() || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2
      }).format(numeric);
    } catch {
      const absolute = Math.abs(numeric).toFixed(2);
      return (numeric < 0 ? "-$" : "$") + absolute;
    }
  };

  const formatSignedCurrencyValue = (value, currency = "USD") => {
    const formatted = formatCurrencyValue(value, currency);
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0 || formatted === "--") {
      return formatted;
    }

    return "+" + formatted;
  };

  const formatPlainNumber = (value, fractionDigits = 2) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }

    return numeric.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits
    });
  };

  const formatDateTimeLabel = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "Not synced";
    }

    try {
      return new Date(numeric).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return "Not synced";
    }
  };

  const formatTradeDurationLabel = (startValue, endValue) => {
    const start = Number(startValue);
    const end = Number(endValue);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return "--";
    }

    const totalMinutes = Math.max(1, Math.round((end - start) / 60000));
    if (totalMinutes < 60) {
      return totalMinutes + "m";
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
      return hours + "h";
    }

    return hours + "h " + minutes + "m";
  };

  const buildCustomSummaryMap = (payload) => {
    const items =
      payload && Array.isArray(payload.summaries) ? payload.summaries : [];
    const summaryMap = {};

    items.forEach((item) => {
      if (!isObjectRecord(item)) {
        return;
      }

      const accountId = String(item.accountId || "").trim();
      if (!accountId) {
        return;
      }

      summaryMap[accountId] = item;
    });

    return summaryMap;
  };

  const findAccountFromPayload = (payload, accountId) => {
    const accounts = payload && Array.isArray(payload.accounts) ? payload.accounts : [];
    return (
      accounts.find((account) => String(account && account.id) === String(accountId || "")) || null
    );
  };

  const findAccountFromPayloadByProviderAccountId = (payload, providerAccountId) => {
    const accounts = payload && Array.isArray(payload.accounts) ? payload.accounts : [];
    return (
      accounts.find(
        (account) =>
          String(account && account.providerAccountId) === String(providerAccountId || "")
      ) || null
    );
  };

  const resolveConnectionState = (account) => {
    const status = String((account && account.status) || "").trim();
    if (status === "Connected") {
      return { label: "Connected", tone: "green" };
    }
    if (status === "Error") {
      return { label: "Error", tone: "red" };
    }
    return { label: "Disconnected", tone: "gray" };
  };

  const resolveTradingState = (account, summaryOrDashboard) => {
    if (account && account.paused) {
      return { label: "Paused", tone: "gray" };
    }

    if (account && account.status !== "Connected") {
      return { label: "Waiting", tone: "amber" };
    }

    if (
      summaryOrDashboard &&
      typeof summaryOrDashboard.tradeAllowed === "boolean" &&
      summaryOrDashboard.tradeAllowed === false
    ) {
      return { label: "Disabled", tone: "red" };
    }

    const openPositions = Number(
      summaryOrDashboard && summaryOrDashboard.openPositionsCount !== undefined
        ? summaryOrDashboard.openPositionsCount
        : summaryOrDashboard &&
            Array.isArray(summaryOrDashboard.openPositions)
          ? summaryOrDashboard.openPositions.length
          : 0
    );

    if (openPositions > 0) {
      return { label: "Trading", tone: "blue" };
    }

    return { label: "Ready", tone: "green" };
  };

  const buildStatusPillMarkup = (label, tone) =>
    '<span class="korra-copytrade-shell__pill korra-copytrade-shell__pill--' +
    escapeHtml(tone) +
    '">' +
    escapeHtml(label) +
    "</span>";

  const buildListHeaderMarkup = () =>
    '<div class="korra-copytrade-shell__toolbar">' +
    '<div>' +
    '<div class="korra-copytrade-shell__eyebrow">Copy Trade</div>' +
    '<div class="korra-copytrade-shell__title">Accounts</div>' +
    '<div class="korra-copytrade-shell__subtitle">Live MT5 accounts, balances, and trading status.</div>' +
    "</div>" +
    '<button class="korra-copytrade-shell__button korra-copytrade-shell__button--primary" data-korra-action="add-account">Add Account</button>' +
    "</div>";

  const buildCopyTradePresetOptionsMarkup = (selectedPresetName) => {
    const normalizedSelected = String(selectedPresetName || "").trim();
    const presets = readCopyTradeSettingPresets();
    const names = Object.keys(presets).sort((left, right) => left.localeCompare(right));
    const options = [
      '<option value="">No preset</option>'
    ].concat(
      names.map((name) => {
        const selected = name === normalizedSelected ? ' selected="selected"' : "";
        return (
          '<option value="' +
          escapeHtml(name) +
          '"' +
          selected +
          ">" +
          escapeHtml(name) +
          "</option>"
        );
      })
    );

    return options.join("");
  };

  const buildStatisticsHeaderMarkup = (account, dashboard, formState) => {
    const accountId = String(account && account.id || "").trim();
    const connection = resolveConnectionState(account);
    const trading = resolveTradingState(account, dashboard);
    const selectedPresetName = String(formState && formState.selectedPresetName || "").trim();
    const controlsDisabled =
      formState &&
      (formState.pending || formState.pausePending || formState.reconnectPending);
    const syncedAt =
      dashboard && dashboard.lastSyncedAt
        ? formatDateTimeLabel(dashboard.lastSyncedAt)
        : formatDateTimeLabel(account && account.lastHeartbeatAt);
    const reconnectButton =
      account && account.status !== "Connected"
        ? '<button class="korra-copytrade-shell__button korra-copytrade-shell__button--ghost" data-korra-action="reconnect-account" data-account-id="' +
          escapeHtml(accountId) +
          '">' +
          escapeHtml(formState && formState.reconnectPending ? "Connecting..." : "Reconnect") +
          "</button>"
        : "";

    return (
      '<div class="korra-copytrade-shell__toolbar">' +
      '<div>' +
      '<div class="korra-copytrade-shell__eyebrow">Copy Trade / Statistics</div>' +
      '<div class="korra-copytrade-shell__title">' +
      escapeHtml(buildCopyTradeDisplayName(account)) +
      "</div>" +
      '<div class="korra-copytrade-shell__subtitle">' +
      escapeHtml(String((account && account.server) || "").trim()) +
      " / " +
      escapeHtml(syncedAt) +
      "</div>" +
      '<div class="korra-copytrade-shell__statusLine" style="margin-top:10px;">' +
      buildStatusPillMarkup(connection.label, connection.tone) +
      buildStatusPillMarkup(trading.label, trading.tone) +
      "</div>" +
      "</div>" +
      '<div class="korra-copytrade-shell__toolbarActions">' +
      '<div class="korra-copytrade-shell__toolbarActionGroup">' +
      '<button class="korra-copytrade-shell__button ' +
      (account && account.paused
        ? "korra-copytrade-shell__button--success"
        : "korra-copytrade-shell__button--ghost") +
      '" data-korra-action="toggle-account-pause" data-account-id="' +
      escapeHtml(accountId) +
      '" data-paused="' +
      escapeHtml(String(!(account && account.paused))) +
      '">' +
      escapeHtml(
        formState && formState.pausePending
          ? "Updating..."
          : account && account.paused
            ? "Resume"
            : "Pause"
      ) +
      "</button>" +
      '<label class="korra-copytrade-shell__toolbarSelectWrap">' +
      '<select class="korra-copytrade-shell__toolbarSelect" data-korra-preset-account-id="' +
      escapeHtml(accountId) +
      '"' +
      (controlsDisabled ? ' disabled="disabled"' : "") +
      ">" +
      buildCopyTradePresetOptionsMarkup(selectedPresetName) +
      "</select>" +
      "</label>" +
      reconnectButton +
      "</div>" +
      '<button class="korra-copytrade-shell__button korra-copytrade-shell__toolbarBack" data-korra-action="back-home">All Accounts</button>' +
      "</div>" +
      "</div>"
    );
  };

  const buildStatisticsControlsMarkup = (account, formState) => {
    const accountId = String(account && account.id || "").trim();
    const selectedPresetName = String(formState && formState.selectedPresetName || "").trim();
    const feedbackMarkup = formState && formState.error
      ? '<div class="korra-copytrade-shell__feedback korra-copytrade-shell__feedback--error">' +
        escapeHtml(formState.error) +
        "</div>"
      : formState && formState.success
        ? '<div class="korra-copytrade-shell__feedback korra-copytrade-shell__feedback--success">' +
          escapeHtml(formState.success) +
          "</div>"
        : "";
    const reconnectButton =
      account && account.status !== "Connected"
        ? '<button class="korra-copytrade-shell__button korra-copytrade-shell__button--ghost" data-korra-action="reconnect-account" data-account-id="' +
          escapeHtml(accountId) +
          '">' +
          escapeHtml(formState && formState.reconnectPending ? "Connecting..." : "Reconnect") +
          "</button>"
        : "";
    return (
      '<div class="korra-copytrade-shell__controlCard">' +
      '<div class="korra-copytrade-shell__controlHeader">' +
      '<div>' +
      '<div class="korra-copytrade-shell__controlTitle">Account Controls</div>' +
      '<div class="korra-copytrade-shell__controlSubtitle">' +
      escapeHtml(
        selectedPresetName
          ? "Assigned settings preset for this account."
          : "No preset assigned to this account yet."
      ) +
      "</div>" +
      "</div>" +
      '<div class="korra-copytrade-shell__controlActions">' +
      '<button class="korra-copytrade-shell__button ' +
      (account && account.paused
        ? "korra-copytrade-shell__button--success"
        : "korra-copytrade-shell__button--ghost") +
      '" data-korra-action="toggle-account-pause" data-account-id="' +
      escapeHtml(accountId) +
      '" data-paused="' +
      escapeHtml(String(!(account && account.paused))) +
      '">' +
      escapeHtml(
        formState && formState.pausePending
          ? "Updating..."
          : account && account.paused
            ? "Resume"
            : "Pause"
      ) +
      "</button>" +
      reconnectButton +
      "</div>" +
      "</div>" +
      '<div class="korra-copytrade-shell__controlsGrid">' +
      '<label class="korra-copytrade-shell__controlField">' +
      '<span class="korra-copytrade-shell__controlFieldLabel">Preset</span>' +
      '<div class="korra-copytrade-shell__controlValue">' +
      escapeHtml(selectedPresetName || "No preset loaded") +
      "</div>" +
      "</label>" +
      "</div>" +
      feedbackMarkup +
      "</div>"
    );
  };

  const buildStatisticsFormFeedbackMarkup = (formState) => {
    if (formState && formState.error) {
      return (
        '<div class="korra-copytrade-shell__feedback korra-copytrade-shell__feedback--error">' +
        escapeHtml(formState.error) +
        "</div>"
      );
    }

    if (formState && formState.success) {
      return (
        '<div class="korra-copytrade-shell__feedback korra-copytrade-shell__feedback--success">' +
        escapeHtml(formState.success) +
        "</div>"
      );
    }

    return "";
  };

  const buildAddAccountHeaderMarkup = () =>
    '<div class="korra-copytrade-shell__toolbar">' +
    '<div>' +
    '<div class="korra-copytrade-shell__eyebrow">Copy Trade / Add Account</div>' +
    '<div class="korra-copytrade-shell__title">Add MT5 Account</div>' +
    '<div class="korra-copytrade-shell__subtitle">Connect a MetaTrader 5 account to your copy-trade workspace.</div>' +
    "</div>" +
    '<button class="korra-copytrade-shell__button" data-korra-action="back-home">All Accounts</button>' +
    "</div>";

  const buildCustomCopyTradeAddAccountMarkup = () => {
    const state = getCustomCopyTradeAddFormState();
    const feedbackMarkup =
      state.error
        ? '<div class="korra-copytrade-shell__message korra-copytrade-shell__message--error" style="padding:0;">' +
          escapeHtml(state.error) +
          "</div>"
        : state.success
          ? '<div class="korra-copytrade-shell__message" style="padding:0; color:#9ad8ad;">' +
            escapeHtml(state.success) +
            "</div>"
          : "";

    return (
      buildAddAccountHeaderMarkup() +
      '<div class="korra-copytrade-shell__formWrap">' +
      '<div class="korra-copytrade-shell__formCard">' +
      '<div class="korra-copytrade-shell__formTitle">Broker Sync</div>' +
      '<div class="korra-copytrade-shell__formSubtitle">Server, login, and password only.</div>' +
      '<form class="korra-copytrade-shell__form" data-korra-form="add-account">' +
      '<label class="korra-copytrade-shell__field">' +
      '<span class="korra-copytrade-shell__fieldLabel">Server</span>' +
      '<input class="korra-copytrade-shell__input" data-korra-field="server" name="server" autocomplete="off" value="' +
      escapeHtml(String(state.server || "")) +
      '" />' +
      "</label>" +
      '<label class="korra-copytrade-shell__field">' +
      '<span class="korra-copytrade-shell__fieldLabel">Login</span>' +
      '<input class="korra-copytrade-shell__input" data-korra-field="login" name="login" autocomplete="off" value="' +
      escapeHtml(String(state.login || "")) +
      '" />' +
      "</label>" +
      '<label class="korra-copytrade-shell__field">' +
      '<span class="korra-copytrade-shell__fieldLabel">Password</span>' +
      '<input class="korra-copytrade-shell__input" data-korra-field="password" name="password" type="password" autocomplete="current-password" value="' +
      escapeHtml(String(state.password || "")) +
      '" />' +
      "</label>" +
      feedbackMarkup +
      '<button class="korra-copytrade-shell__button korra-copytrade-shell__button--primary korra-copytrade-shell__button--block" type="submit" data-korra-action="submit-add-account"' +
      (state.pending ? ' disabled="disabled"' : "") +
      ">" +
      escapeHtml(state.pending ? "Connecting..." : "Connect") +
      "</button>" +
      "</form>" +
      "</div>" +
      "</div>" +
      (state.pending ? buildCustomCopyTradeLoadingOverlayMarkup("Connecting MT5...") : "")
    );
  };

  const buildCustomCopyTradeListMarkup = () => {
    const store = getCustomCopyTradeStore();
    const payload =
      isObjectRecord(store.list.data) ? store.list.data : null;

    if ((!payload || !Array.isArray(payload.accounts)) && !store.list.loading && !store.list.error) {
      void loadCustomCopyTradeList();
    }

    const accounts = payload && Array.isArray(payload.accounts) ? payload.accounts : [];
    const summaryMap = buildCustomSummaryMap(payload);

    if (!accounts.length && store.list.loading) {
      return (
        buildListHeaderMarkup() +
        '<div class="korra-copytrade-shell__message">Loading accounts...</div>' +
        buildCustomCopyTradeLoadingOverlayMarkup("Loading accounts...")
      );
    }

    if (!accounts.length && store.list.error) {
      return (
        buildListHeaderMarkup() +
        '<div class="korra-copytrade-shell__message korra-copytrade-shell__message--error">' +
        escapeHtml(store.list.error) +
        "</div>"
      );
    }

    if (!accounts.length) {
      return (
        buildListHeaderMarkup() +
        '<div class="korra-copytrade-shell__empty">No accounts added yet.</div>'
      );
    }

    const rows = accounts
      .map((account) => {
        const summaryEntry = summaryMap[String(account.id)] || null;
        const summary =
          summaryEntry && isObjectRecord(summaryEntry.summary) ? summaryEntry.summary : null;
        const connection = resolveConnectionState(account);
        const trading = resolveTradingState(account, summary);
        const balanceText = summary
          ? formatCurrencyValue(summary.balance, summary.currency)
          : "--";
        const equityText = summary
          ? formatCurrencyValue(summary.equity, summary.currency)
          : "--";
        const openPositions = Number(summary && summary.openPositionsCount);
        const positionsText =
          Number.isFinite(openPositions) && openPositions >= 0 ? String(openPositions) : "--";

        return (
          '<div class="korra-copytrade-shell__row" data-korra-action="view-statistics" data-account-id="' +
          escapeHtml(String(account.id)) +
          '" data-provider-account-id="' +
          escapeHtml(String(account.providerAccountId || "")) +
          '">' +
          '<div class="korra-copytrade-shell__cell">' +
          '<div class="korra-copytrade-shell__cellLabel">Account</div>' +
          '<div class="korra-copytrade-shell__name">' +
          escapeHtml(buildCopyTradeDisplayName(account)) +
          "</div>" +
          '<div class="korra-copytrade-shell__meta">' +
          escapeHtml(String((account && account.server) || "").trim()) +
          "</div>" +
          "</div>" +
          '<div class="korra-copytrade-shell__cell korra-copytrade-shell__cell--numeric">' +
          '<div class="korra-copytrade-shell__cellLabel">Balance</div>' +
          '<div class="korra-copytrade-shell__money">' +
          escapeHtml(balanceText) +
          "</div>" +
          "</div>" +
          '<div class="korra-copytrade-shell__cell korra-copytrade-shell__cell--numeric">' +
          '<div class="korra-copytrade-shell__cellLabel">Equity</div>' +
          '<div class="korra-copytrade-shell__money">' +
          escapeHtml(equityText) +
          "</div>" +
          "</div>" +
          '<div class="korra-copytrade-shell__cell korra-copytrade-shell__cell--numeric">' +
          '<div class="korra-copytrade-shell__cellLabel">Positions</div>' +
          '<div class="korra-copytrade-shell__count">' +
          escapeHtml(positionsText) +
          "</div>" +
          "</div>" +
          '<div class="korra-copytrade-shell__cell">' +
          '<div class="korra-copytrade-shell__cellLabel">Connection</div>' +
          buildStatusPillMarkup(connection.label, connection.tone) +
          "</div>" +
          '<div class="korra-copytrade-shell__cell">' +
          '<div class="korra-copytrade-shell__cellLabel">Trading</div>' +
          buildStatusPillMarkup(trading.label, trading.tone) +
          "</div>" +
          '<div class="korra-copytrade-shell__rowAction">' +
          '<button class="korra-copytrade-shell__button korra-copytrade-shell__button--danger" data-korra-action="delete-account" data-account-id="' +
          escapeHtml(String(account.id)) +
          '">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    return (
      buildListHeaderMarkup() +
      '<div class="korra-copytrade-shell__table">' +
      '<div class="korra-copytrade-shell__row--head">' +
      '<div class="korra-copytrade-shell__cell">Account</div>' +
      '<div class="korra-copytrade-shell__cell korra-copytrade-shell__headCell--numeric">Balance</div>' +
      '<div class="korra-copytrade-shell__cell korra-copytrade-shell__headCell--numeric">Equity</div>' +
      '<div class="korra-copytrade-shell__cell korra-copytrade-shell__headCell--numeric">Positions</div>' +
      '<div class="korra-copytrade-shell__cell">Connection</div>' +
      '<div class="korra-copytrade-shell__cell">Trading</div>' +
      '<div class="korra-copytrade-shell__cell korra-copytrade-shell__headCell--action">Delete</div>' +
      "</div>" +
      rows +
      "</div>" +
      (store.list.loading ? buildCustomCopyTradeLoadingOverlayMarkup("Refreshing accounts...") : "")
    );
  };

  const formatPercentValue = (value, fractionDigits = 1) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }

    return (
      numeric.toLocaleString("en-US", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      }) + "%"
    );
  };

  const formatFactorValue = (value, fractionDigits = 2) => {
    const numeric = Number(value);
    if (numeric === Number.POSITIVE_INFINITY) {
      return "∞";
    }

    if (!Number.isFinite(numeric)) {
      return "--";
    }

    return numeric.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    });
  };

  const formatChartTimeLabel = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "--";
    }

    try {
      return new Date(numeric).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return "--";
    }
  };

  const resolveNumericToneClass = (value, positiveThreshold = 0) => {
    if (value == null || value === "") {
      return "";
    }

    if (value === Number.POSITIVE_INFINITY) {
      return "korra-copytrade-shell__statValue--green";
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "";
    }

    if (numeric > positiveThreshold) {
      return "korra-copytrade-shell__statValue--green";
    }

    if (numeric < positiveThreshold) {
      return "korra-copytrade-shell__statValue--red";
    }

    return "";
  };

  const resolveHeroToneClass = (value, positiveThreshold = 0) => {
    if (value == null || value === "") {
      return "";
    }

    if (value === Number.POSITIVE_INFINITY) {
      return "korra-copytrade-shell__heroValue--green";
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "";
    }

    if (numeric > positiveThreshold) {
      return "korra-copytrade-shell__heroValue--green";
    }

    if (numeric < positiveThreshold) {
      return "korra-copytrade-shell__heroValue--red";
    }

    return "";
  };

  const buildSidePillMarkup = (sideValue) => {
    const normalizedSide = String(sideValue || "N/A").trim().toUpperCase();
    const toneClass =
      normalizedSide === "BUY"
        ? "buy"
        : normalizedSide === "SELL"
          ? "sell"
          : "neutral";
    return (
      '<span class="korra-copytrade-shell__detailSidePill korra-copytrade-shell__detailSidePill--' +
      escapeHtml(toneClass) +
      '">' +
      escapeHtml(normalizedSide) +
      "</span>"
    );
  };

  const buildStatisticsMetricMarkup = (label, value, valueClassName = "") =>
    '<div class="korra-copytrade-shell__stat">' +
    '<div class="korra-copytrade-shell__statLabel">' +
    escapeHtml(label) +
    "</div>" +
    '<div class="korra-copytrade-shell__statValue' +
    (valueClassName ? " " + escapeHtml(valueClassName) : "") +
    '">' +
    escapeHtml(value) +
    "</div>" +
    "</div>";

  const buildStatisticsHeroCardMarkup = (
    label,
    value,
    asideLabel = "",
    asideValue = "",
    valueClassName = "",
    asideValueClassName = ""
  ) =>
    '<div class="korra-copytrade-shell__heroCard">' +
    '<div class="korra-copytrade-shell__heroCardHeader">' +
    '<div class="korra-copytrade-shell__heroLabel">' +
    escapeHtml(label) +
    "</div>" +
    (asideLabel || asideValue
      ? '<div class="korra-copytrade-shell__heroAside">' +
        '<div class="korra-copytrade-shell__heroAsideLabel">' +
        escapeHtml(asideLabel) +
        "</div>" +
        '<div class="korra-copytrade-shell__heroAsideValue' +
        (asideValueClassName ? " " + escapeHtml(asideValueClassName) : "") +
        '">' +
        escapeHtml(asideValue) +
        "</div>" +
        "</div>"
      : "") +
    "</div>" +
    '<div class="korra-copytrade-shell__heroValue' +
    (valueClassName ? " " + escapeHtml(valueClassName) : "") +
    '">' +
    escapeHtml(value) +
    "</div>" +
    "</div>";

  const buildDerivedPerformanceModel = (dashboard) => {
    const deals = Array.isArray(dashboard && dashboard.recentDeals) ? dashboard.recentDeals : [];
    const closedDeals = deals
      .filter((deal) => String(deal && deal.entryType || "").toUpperCase().includes("OUT"))
      .slice()
      .sort((left, right) => (left && left.time || 0) - (right && right.time || 0));
    const totalTrades = closedDeals.length;
    const wins = closedDeals.filter((deal) => Number(deal && deal.profit) > 0).length;
    const losses = closedDeals.filter((deal) => Number(deal && deal.profit) < 0).length;
    const grossProfit = closedDeals.reduce((sum, deal) => {
      const profit = Number(deal && deal.profit);
      return sum + (Number.isFinite(profit) && profit > 0 ? profit : 0);
    }, 0);
    const grossLossAbs = closedDeals.reduce((sum, deal) => {
      const profit = Number(deal && deal.profit);
      return sum + (Number.isFinite(profit) && profit < 0 ? Math.abs(profit) : 0);
    }, 0);
    const realizedPnl = closedDeals.reduce((sum, deal) => {
      const profit = Number(deal && deal.profit);
      return sum + (Number.isFinite(profit) ? profit : 0);
    }, 0);
    const rawBalance = Number(dashboard && dashboard.balance);
    const rawEquity = Number(dashboard && dashboard.equity);
    const currentBalance = Number.isFinite(rawBalance) ? rawBalance : null;
    const currentEquity =
      Number.isFinite(rawEquity) ? rawEquity : Number.isFinite(rawBalance) ? rawBalance : null;
    const startingBalanceCandidate =
      currentBalance != null ? currentBalance - realizedPnl : realizedPnl !== 0 ? -realizedPnl : 0;
    const startingBalance = Number.isFinite(startingBalanceCandidate) ? startingBalanceCandidate : 0;
    const baselineTime =
      totalTrades > 0 && Number.isFinite(Number(closedDeals[0] && closedDeals[0].time))
        ? Number(closedDeals[0] && closedDeals[0].time)
        : Number(dashboard && dashboard.lastSyncedAt) || Date.now();
    const balanceSeries = [{ time: baselineTime, value: startingBalance }];
    let runningBalance = startingBalance;
    let peakBalance = startingBalance;
    let maxDrawdownPct = 0;

    closedDeals.forEach((deal, index) => {
      const profit = Number(deal && deal.profit);
      runningBalance += Number.isFinite(profit) ? profit : 0;
      const rawTime = Number(deal && deal.time);
      const pointTime =
        Number.isFinite(rawTime) && rawTime > 0 ? rawTime : baselineTime + (index + 1) * 60000;
      balanceSeries.push({
        time: pointTime,
        value: runningBalance
      });
      if (runningBalance > peakBalance) {
        peakBalance = runningBalance;
      }
      if (peakBalance > 0) {
        const drawdown = ((peakBalance - runningBalance) / peakBalance) * 100;
        if (drawdown > maxDrawdownPct) {
          maxDrawdownPct = drawdown;
        }
      }
    });

    const syncedAt = Number(dashboard && dashboard.lastSyncedAt) || Date.now();
    const finalBalance = currentBalance != null ? currentBalance : runningBalance;
    const lastBalancePoint = balanceSeries[balanceSeries.length - 1];
    if (
      !lastBalancePoint ||
      Math.abs(Number(lastBalancePoint.value) - finalBalance) > 0.0001 ||
      Math.abs(Number(lastBalancePoint.time) - syncedAt) > 60000
    ) {
      balanceSeries.push({
        time: syncedAt,
        value: finalBalance
      });
    }

    const finalEquity = currentEquity != null ? currentEquity : finalBalance;
    const equitySeries = balanceSeries.map((point, index) =>
      index === balanceSeries.length - 1
        ? {
            time: syncedAt,
            value: finalEquity
          }
        : point
    );
    const bestTrade = closedDeals.reduce((best, deal) => {
      const profit = Number(deal && deal.profit);
      if (!Number.isFinite(profit)) {
        return best;
      }
      return best == null || profit > best ? profit : best;
    }, null);
    const worstTrade = closedDeals.reduce((worst, deal) => {
      const profit = Number(deal && deal.profit);
      if (!Number.isFinite(profit)) {
        return worst;
      }
      return worst == null || profit < worst ? profit : worst;
    }, null);

    return {
      closedDeals,
      totalTrades,
      wins,
      losses,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : null,
      profitFactor:
        grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? Number.POSITIVE_INFINITY : null,
      avgWin: wins > 0 ? grossProfit / wins : null,
      avgLoss: losses > 0 ? -(grossLossAbs / losses) : null,
      bestTrade,
      worstTrade,
      maxDrawdownPct,
      startingBalance,
      balanceSeries: balanceSeries.slice(-48),
      equitySeries: equitySeries.slice(-48),
      currentBalance: finalBalance,
      currentEquity: finalEquity,
      realizedPnl
    };
  };

  const buildChartPath = (series, width, height, padding, minTime, maxTime, minValue, maxValue) => {
    if (!Array.isArray(series) || !series.length) {
      return "";
    }

    const safeSeries =
      series.length > 1
        ? series
        : [
            series[0],
            {
              time: Number(series[0].time) + 60000,
              value: Number(series[0].value)
            }
          ];
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xRange = Math.max(1, maxTime - minTime);
    const yRange = Math.max(1, maxValue - minValue);

    return safeSeries
      .map((point, index) => {
        const x =
          padding.left + ((Number(point.time) - minTime) / xRange) * plotWidth;
        const y =
          padding.top + (1 - (Number(point.value) - minValue) / yRange) * plotHeight;
        return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
      })
      .join(" ");
  };

  const buildAreaPath = (series, width, height, padding, minTime, maxTime, minValue, maxValue) => {
    if (!Array.isArray(series) || !series.length) {
      return "";
    }

    const safeSeries =
      series.length > 1
        ? series
        : [
            series[0],
            {
              time: Number(series[0].time) + 60000,
              value: Number(series[0].value)
            }
          ];
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xRange = Math.max(1, maxTime - minTime);
    const yRange = Math.max(1, maxValue - minValue);
    const baselineY = padding.top + plotHeight;
    const firstX =
      padding.left + ((Number(safeSeries[0].time) - minTime) / xRange) * plotWidth;
    const linePath = safeSeries
      .map((point, index) => {
        const x =
          padding.left + ((Number(point.time) - minTime) / xRange) * plotWidth;
        const y =
          padding.top + (1 - (Number(point.value) - minValue) / yRange) * plotHeight;
        return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
      })
      .join(" ");
    const last = safeSeries[safeSeries.length - 1];
    const lastX =
      padding.left + ((Number(last.time) - minTime) / xRange) * plotWidth;

    return (
      linePath +
      " L" +
      lastX.toFixed(2) +
      " " +
      baselineY.toFixed(2) +
      " L" +
      firstX.toFixed(2) +
      " " +
      baselineY.toFixed(2) +
      " Z"
    );
  };

  const buildEquityChartMarkup = (model, currency) => {
    const balanceSeries = Array.isArray(model && model.balanceSeries) ? model.balanceSeries : [];
    const equitySeries = Array.isArray(model && model.equitySeries) ? model.equitySeries : [];
    const allPoints = balanceSeries.concat(equitySeries).filter((point) => {
      return Number.isFinite(Number(point && point.time)) && Number.isFinite(Number(point && point.value));
    });

    if (!allPoints.length) {
      return (
        '<div class="korra-copytrade-shell__chartCard">' +
        '<div class="korra-copytrade-shell__chartHeader">' +
        '<div><div class="korra-copytrade-shell__chartTitle">Balance</div>' +
        '<div class="korra-copytrade-shell__chartSubtitle">No synchronized history yet.</div></div>' +
        "</div>" +
        "</div>"
      );
    }

    const width = 860;
    const height = 148;
    const padding = { top: 8, right: 14, bottom: 24, left: 60 };
    const times = allPoints.map((point) => Number(point.time));
    const values = allPoints.map((point) => Number(point.value));
    let minTime = Math.min.apply(null, times);
    let maxTime = Math.max.apply(null, times);
    if (!(maxTime > minTime)) {
      maxTime = minTime + 60000;
    }

    let minValue = Math.min.apply(null, values);
    let maxValue = Math.max.apply(null, values);
    if (!(maxValue > minValue)) {
      const paddingValue = Math.max(25, Math.abs(maxValue || minValue || 0) * 0.02);
      minValue -= paddingValue;
      maxValue += paddingValue;
    } else {
      const valuePadding = (maxValue - minValue) * 0.12;
      minValue -= valuePadding;
      maxValue += valuePadding;
    }

    const plotHeight = height - padding.top - padding.bottom;
    const plotWidth = width - padding.left - padding.right;
    const xRange = Math.max(1, maxTime - minTime);
    const yRange = Math.max(1, maxValue - minValue);
    const yAxisMarks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = padding.top + ratio * plotHeight;
      const value = maxValue - ratio * (maxValue - minValue);
      return (
        '<line x1="' +
        String(padding.left) +
        '" y1="' +
        y.toFixed(2) +
        '" x2="' +
        String(width - padding.right) +
        '" y2="' +
        y.toFixed(2) +
        '" stroke="#303030" stroke-width="1" stroke-dasharray="3 3" opacity="0.18"></line>' +
        '<text x="' +
        String(padding.left - 8) +
        '" y="' +
        (y + 4).toFixed(2) +
        '" fill="#d4d4d8" font-size="10" text-anchor="end">' +
        escapeHtml(formatPlainNumber(value, 0)) +
        "</text>"
      );
    }).join("");
    const xAxisMarks = [0, 1 / 3, 2 / 3, 1]
      .map((ratio) => minTime + (maxTime - minTime) * ratio)
      .map((time, index) => {
        const anchor = index === 0 ? "start" : index === 3 ? "end" : "middle";
        const x = padding.left + ((time - minTime) / xRange) * plotWidth;
        return (
          '<text x="' +
          x.toFixed(2) +
          '" y="' +
          String(height - 8) +
          '" fill="#d4d4d8" font-size="10" text-anchor="' +
          anchor +
          '">' +
          escapeHtml(
            new Date(time).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit"
            })
          ) +
          "</text>"
        );
      })
      .join("");
    const verticalMarks = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const x = padding.left + ratio * plotWidth;
        return (
          '<line x1="' +
          x.toFixed(2) +
          '" y1="' +
          String(padding.top) +
          '" x2="' +
          x.toFixed(2) +
          '" y2="' +
          String(height - padding.bottom) +
          '" stroke="#303030" stroke-width="1" stroke-dasharray="3 3" opacity="0.18"></line>'
        );
      })
      .join("");
    const balancePath = buildChartPath(
      balanceSeries,
      width,
      height,
      padding,
      minTime,
      maxTime,
      minValue,
      maxValue
    );
    const equityPath = buildChartPath(
      equitySeries,
      width,
      height,
      padding,
      minTime,
      maxTime,
      minValue,
      maxValue
    );
    const interactivePointMap = new Map();
    balanceSeries.forEach((point) => {
      const time = Number(point && point.time);
      if (!Number.isFinite(time)) {
        return;
      }
      const key = String(time);
      const entry = interactivePointMap.get(key) || { time };
      entry.balance = Number(point && point.value);
      interactivePointMap.set(key, entry);
    });
    equitySeries.forEach((point) => {
      const time = Number(point && point.time);
      if (!Number.isFinite(time)) {
        return;
      }
      const key = String(time);
      const entry = interactivePointMap.get(key) || { time };
      entry.equity = Number(point && point.value);
      interactivePointMap.set(key, entry);
    });
    const interactivePoints = Array.from(interactivePointMap.values())
      .sort((left, right) => Number(left.time || 0) - Number(right.time || 0))
      .map((point) => {
        const x = padding.left + ((Number(point.time) - minTime) / xRange) * plotWidth;
        const balanceValue = Number(point.balance);
        const equityValue = Number(point.equity);
        return {
          time: Number(point.time),
          balance: Number.isFinite(balanceValue) ? balanceValue : null,
          equity: Number.isFinite(equityValue) ? equityValue : null,
          x,
          balanceY:
            Number.isFinite(balanceValue)
              ? padding.top + (1 - (balanceValue - minValue) / yRange) * plotHeight
              : null,
          equityY:
            Number.isFinite(equityValue)
              ? padding.top + (1 - (equityValue - minValue) / yRange) * plotHeight
              : null
        };
      });
    const chartConfig = escapeHtml(
      JSON.stringify({
        currency,
        plotLeft: padding.left,
        plotRight: width - padding.right,
        plotTop: padding.top,
        plotBottom: height - padding.bottom,
        points: interactivePoints
      })
    );
    return (
      '<div class="korra-copytrade-shell__chartCard">' +
      '<div class="korra-copytrade-shell__chartHeader">' +
      '<div>' +
      '<div class="korra-copytrade-shell__chartTitle">Balance</div>' +
      "</div>" +
      '<div class="korra-copytrade-shell__chartLegend">' +
      '<span class="korra-copytrade-shell__chartLegendItem"><span class="korra-copytrade-shell__chartLegendDot" style="background:#38bdf8;"></span>Balance' +
      "</span>" +
      '<span class="korra-copytrade-shell__chartLegendItem"><span class="korra-copytrade-shell__chartLegendDot" style="background:#fb7185;"></span>Equity' +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="korra-copytrade-shell__chartStage" data-korra-chart-root="true" data-korra-chart-config="' +
      chartConfig +
      '">' +
      '<svg class="korra-copytrade-shell__chartSvg" viewBox="0 0 860 148" role="img" aria-label="Account equity curve" data-korra-chart-svg="true">' +
      yAxisMarks +
      verticalMarks +
      '<line class="korra-copytrade-shell__chartGuideLine" data-korra-chart-guide="true" x1="' +
      String(padding.left) +
      '" y1="' +
      String(padding.top) +
      '" x2="' +
      String(padding.left) +
      '" y2="' +
      String(height - padding.bottom) +
      '" stroke="#a1a1aa" stroke-width="1" stroke-dasharray="3 3" opacity="0"></line>' +
      '<path d="' +
      balancePath +
      '" fill="none" stroke="#38bdf8" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path d="' +
      equityPath +
      '" fill="none" stroke="#fb7185" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<circle class="korra-copytrade-shell__chartGuideDot" data-korra-chart-balance-dot="true" cx="' +
      String(padding.left) +
      '" cy="' +
      String(padding.top) +
      '" r="4" fill="#38bdf8" stroke="#020617" stroke-width="2" opacity="0"></circle>' +
      '<circle class="korra-copytrade-shell__chartGuideDot" data-korra-chart-equity-dot="true" cx="' +
      String(padding.left) +
      '" cy="' +
      String(padding.top) +
      '" r="4" fill="#fb7185" stroke="#020617" stroke-width="2" opacity="0"></circle>' +
      xAxisMarks +
      '<rect data-korra-chart-hitbox="true" x="' +
      String(padding.left) +
      '" y="' +
      String(padding.top) +
      '" width="' +
      plotWidth.toFixed(2) +
      '" height="' +
      plotHeight.toFixed(2) +
      '" fill="transparent" style="cursor:crosshair;"></rect>' +
      "</svg>" +
      '<div class="korra-copytrade-shell__chartTooltip" data-korra-chart-tooltip="true" aria-hidden="true">' +
      '<div class="korra-copytrade-shell__chartTooltipLabel" data-korra-chart-tooltip-label="true"></div>' +
      '<div class="korra-copytrade-shell__chartTooltipRow"><span class="korra-copytrade-shell__chartTooltipSwatch" style="background:#38bdf8;"></span><span>Balance</span><span class="korra-copytrade-shell__chartTooltipValue" data-korra-chart-tooltip-balance="true"></span></div>' +
      '<div class="korra-copytrade-shell__chartTooltipRow"><span class="korra-copytrade-shell__chartTooltipSwatch" style="background:#fb7185;"></span><span>Equity</span><span class="korra-copytrade-shell__chartTooltipValue" data-korra-chart-tooltip-equity="true"></span></div>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  };

  const buildStatisticsTableRows = (items, columns, getRowClassName = null) => {
    if (!items.length) {
      return (
        '<tr><td colspan="' +
        String(columns.length) +
        '">No data available.</td></tr>'
      );
    }

    return items
      .map((item) => {
        const cells = columns
          .map((column) => {
            const resolvedClassName =
              typeof column.className === "function"
                ? column.className(item)
                : column.className;
            const className = resolvedClassName
              ? ' class="' + escapeHtml(resolvedClassName) + '"'
              : "";
            return "<td" + className + ">" + column.render(item) + "</td>";
          })
          .join("");
        const rowClassName =
          typeof getRowClassName === "function" ? String(getRowClassName(item) || "").trim() : "";
        return (
          "<tr" +
          (rowClassName ? ' class="' + escapeHtml(rowClassName) + '"' : "") +
          ">" +
          cells +
          "</tr>"
        );
      })
      .join("");
  };

  const buildClosedTradeHistoryItems = (deals) => {
    const sourceDeals = Array.isArray(deals) ? deals : [];
    const groupedDeals = new Map();

    sourceDeals
      .filter((deal) => isObjectRecord(deal))
      .slice()
      .sort((left, right) => Number(left.time || 0) - Number(right.time || 0))
      .forEach((deal) => {
        const positionId = String(deal.positionId || "").trim();
        const fallbackKey =
          String(deal.symbol || "N/A") +
          ":" +
          String(deal.side || "N/A") +
          ":" +
          String(Math.trunc(Number(deal.time || 0) / 60000));
        const key = positionId || fallbackKey;
        const bucket = groupedDeals.get(key) || [];
        bucket.push(deal);
        groupedDeals.set(key, bucket);
      });

    return Array.from(groupedDeals.entries())
      .map(([key, bucket]) => {
        const sortedBucket = bucket
          .slice()
          .sort((left, right) => Number(left.time || 0) - Number(right.time || 0));
        const entryDeals = sortedBucket.filter((deal) =>
          String(deal.entryType || "").toUpperCase().includes("IN")
        );
        const exitDeals = sortedBucket.filter((deal) =>
          String(deal.entryType || "").toUpperCase().includes("OUT")
        );

        if (!exitDeals.length) {
          return null;
        }

        const openDeal = entryDeals[0] || sortedBucket[0] || null;
        const closeDeal = exitDeals[exitDeals.length - 1] || sortedBucket[sortedBucket.length - 1] || null;
        if (!openDeal || !closeDeal) {
          return null;
        }

        const openTime = Number(openDeal.time || 0);
        const closeTime = Number(closeDeal.time || 0);
        const realizedProfit = exitDeals.reduce((sum, deal) => {
          const profit = Number(deal && deal.profit);
          return sum + (Number.isFinite(profit) ? profit : 0);
        }, 0);

        return {
          id: key,
          side: String(openDeal.side || closeDeal.side || "N/A"),
          symbol: String(openDeal.symbol || closeDeal.symbol || "N/A"),
          volume: Number(closeDeal.volume ?? openDeal.volume ?? Number.NaN),
          openTime: Number.isFinite(openTime) && openTime > 0 ? openTime : null,
          closeTime: Number.isFinite(closeTime) && closeTime > 0 ? closeTime : null,
          duration:
            Number.isFinite(openTime) && Number.isFinite(closeTime) && closeTime > openTime
              ? closeTime - openTime
              : null,
          profit: realizedProfit
        };
      })
      .filter((item) => item && item.closeTime)
      .sort((left, right) => Number(right.closeTime || 0) - Number(left.closeTime || 0));
  };

  const buildCustomCopyTradeStatisticsMarkup = (accountId, providerAccountId) => {
    const store = getCustomCopyTradeStore();
    const listPayload = isObjectRecord(store.list.data) ? store.list.data : null;
    const accountFromList =
      findAccountFromPayload(listPayload, accountId) ||
      findAccountFromPayloadByProviderAccountId(listPayload, providerAccountId);
    const resolvedAccountId = String(
      (accountFromList && accountFromList.id) || accountId || ""
    ).trim();
    const detailEntry = getCustomCopyTradeDetailEntry(resolvedAccountId);
    const detailPayload = isObjectRecord(detailEntry.data) ? detailEntry.data : null;
    const detailError =
      detailEntry.error ||
      (detailPayload && typeof detailPayload.error === "string" ? detailPayload.error : "");
    const account =
      (detailPayload && isObjectRecord(detailPayload.account) ? detailPayload.account : null) ||
      accountFromList;
    const dashboard =
      detailPayload && isObjectRecord(detailPayload.dashboard) ? detailPayload.dashboard : null;
    const formState = account
      ? getCustomCopyTradeAccountFormState(resolvedAccountId, account)
      : null;

    if (!listPayload && !store.list.loading && !store.list.error) {
      void loadCustomCopyTradeList();
    }

    if (resolvedAccountId && !detailPayload && !detailEntry.loading && !detailEntry.error) {
      void loadCustomCopyTradeDashboard(resolvedAccountId);
    }

    if (!account && (detailEntry.loading || store.list.loading) && !detailError) {
      return (
        buildStatisticsHeaderMarkup(
          {
            id: resolvedAccountId || accountId,
            login: "",
            server: "",
            status: "Disconnected",
            paused: false
          },
          null,
          null
        ) +
        '<div class="korra-copytrade-shell__message">Loading statistics...</div>' +
        buildCustomCopyTradeLoadingOverlayMarkup("Loading account...")
      );
    }

    if (!account) {
      return (
        '<div class="korra-copytrade-shell__toolbar">' +
        '<div>' +
        '<div class="korra-copytrade-shell__eyebrow">Copy Trade / Statistics</div>' +
        '<div class="korra-copytrade-shell__title">Account not found</div>' +
        "</div>" +
        '<button class="korra-copytrade-shell__button" data-korra-action="back-home">All Accounts</button>' +
        "</div>" +
        '<div class="korra-copytrade-shell__message korra-copytrade-shell__message--error">' +
        escapeHtml(detailError || "The requested account could not be found.") +
        "</div>"
      );
    }

    const header = buildStatisticsHeaderMarkup(account, dashboard, formState);
    const formFeedbackMarkup = buildStatisticsFormFeedbackMarkup(formState);
    const currency =
      dashboard && typeof dashboard.currency === "string" && dashboard.currency.trim()
        ? dashboard.currency
        : "USD";
    const performanceModel = dashboard ? buildDerivedPerformanceModel(dashboard) : null;
    const balanceText = formatCurrencyValue(dashboard && dashboard.balance, currency);
    const equityText = formatCurrencyValue(dashboard && dashboard.equity, currency);
    const freeMarginText = formatCurrencyValue(dashboard && dashboard.freeMargin, currency);
    const openProfitText = formatCurrencyValue(dashboard && dashboard.netOpenProfit, currency);
    const closedPnlText = formatCurrencyValue(dashboard && dashboard.dayClosedPnl, currency);
    const closedPnlValue =
      dashboard && dashboard.dayClosedPnl != null
        ? Number(dashboard.dayClosedPnl)
        : performanceModel && performanceModel.realizedPnl != null
          ? Number(performanceModel.realizedPnl)
          : null;
    const balanceDeltaValue =
      performanceModel &&
      Number.isFinite(Number(performanceModel.currentBalance)) &&
      Number.isFinite(Number(performanceModel.startingBalance))
        ? Number(performanceModel.currentBalance) - Number(performanceModel.startingBalance)
        : closedPnlValue;
    const equityDeltaValue =
      dashboard &&
      Number.isFinite(Number(dashboard.equity)) &&
      Number.isFinite(Number(dashboard.balance))
        ? Number(dashboard.equity) - Number(dashboard.balance)
        : dashboard && dashboard.netOpenProfit != null
          ? Number(dashboard.netOpenProfit)
          : performanceModel &&
              Number.isFinite(Number(performanceModel.currentEquity)) &&
              Number.isFinite(Number(performanceModel.currentBalance))
            ? Number(performanceModel.currentEquity) - Number(performanceModel.currentBalance)
            : null;
    const balanceToneClass = resolveHeroToneClass(balanceDeltaValue);
    const equityToneClass = resolveHeroToneClass(equityDeltaValue);
    const closedPnlToneClass = resolveHeroToneClass(closedPnlValue);
    const openPositionsCount = Array.isArray(dashboard && dashboard.openPositions)
      ? dashboard.openPositions.length
      : 0;
    const chartMarkup =
      performanceModel && dashboard ? buildEquityChartMarkup(performanceModel, currency) : "";
    const metricsMarkup = dashboard
      ? '<div class="korra-copytrade-shell__section">' +
        '<div class="korra-copytrade-shell__heroGrid">' +
        buildStatisticsHeroCardMarkup(
          "Balance",
          balanceText,
          "Closed P/L",
          formatSignedCurrencyValue(closedPnlValue, currency),
          balanceToneClass,
          closedPnlToneClass
        ) +
        buildStatisticsHeroCardMarkup(
          "Equity",
          equityText,
          "Free Margin",
          freeMarginText,
          equityToneClass
        ) +
        "</div>" +
        '<div class="korra-copytrade-shell__statsGrid">' +
        buildStatisticsMetricMarkup(
          "Win Rate",
          formatPercentValue(performanceModel && performanceModel.winRate),
          resolveNumericToneClass(performanceModel && performanceModel.winRate, 49.99)
        ) +
        buildStatisticsMetricMarkup(
          "Profit Factor",
          formatFactorValue(performanceModel && performanceModel.profitFactor),
          resolveNumericToneClass(performanceModel && performanceModel.profitFactor, 1)
        ) +
        buildStatisticsMetricMarkup(
          "Trades",
          formatPlainNumber(performanceModel && performanceModel.totalTrades, 0)
        ) +
        buildStatisticsMetricMarkup(
          "Open Positions",
          formatPlainNumber(openPositionsCount, 0)
        ) +
        buildStatisticsMetricMarkup(
          "Avg Win",
          formatCurrencyValue(performanceModel && performanceModel.avgWin, currency),
          resolveNumericToneClass(performanceModel && performanceModel.avgWin)
        ) +
        buildStatisticsMetricMarkup(
          "Avg Loss",
          formatCurrencyValue(performanceModel && performanceModel.avgLoss, currency),
          resolveNumericToneClass(performanceModel && performanceModel.avgLoss)
        ) +
        buildStatisticsMetricMarkup(
          "Max Drawdown",
          formatPercentValue(performanceModel && performanceModel.maxDrawdownPct),
          resolveNumericToneClass(
            performanceModel && performanceModel.maxDrawdownPct != null
              ? -performanceModel.maxDrawdownPct
              : null
          )
        ) +
        buildStatisticsMetricMarkup(
          "Open P/L",
          openProfitText,
          resolveNumericToneClass(dashboard && dashboard.netOpenProfit)
        ) +
        buildStatisticsMetricMarkup(
          "Closed P/L",
          closedPnlText,
          resolveNumericToneClass(dashboard && dashboard.dayClosedPnl)
        ) +
        buildStatisticsMetricMarkup(
          "Best Trade",
          formatCurrencyValue(performanceModel && performanceModel.bestTrade, currency),
          resolveNumericToneClass(performanceModel && performanceModel.bestTrade)
        ) +
        buildStatisticsMetricMarkup(
          "Worst Trade",
          formatCurrencyValue(performanceModel && performanceModel.worstTrade, currency),
          resolveNumericToneClass(performanceModel && performanceModel.worstTrade)
        ) +
        buildStatisticsMetricMarkup("Free Margin", freeMarginText) +
        "</div>" +
        chartMarkup +
        "</div>"
      : "";
    const errorMarkup =
      detailError && !dashboard
        ? '<div class="korra-copytrade-shell__message korra-copytrade-shell__message--error">' +
          escapeHtml(detailError) +
          "</div>"
        : "";
    const loadingMarkup =
      detailEntry.loading && !dashboard
        ? '<div class="korra-copytrade-shell__message">Refreshing account...</div>'
        : "";
    const positions = Array.isArray(dashboard && dashboard.openPositions)
      ? dashboard.openPositions
      : [];
    const recentDeals = Array.isArray(dashboard && dashboard.recentDeals)
      ? dashboard.recentDeals
      : [];
    const closedHistory = buildClosedTradeHistoryItems(recentDeals).slice(0, 24);
    const positionsMarkup =
      '<div class="korra-copytrade-shell__detailCard korra-copytrade-shell__detailCard--history">' +
      '<div class="korra-copytrade-shell__detailCardHeader">' +
      '<div class="korra-copytrade-shell__sectionTitle">Open Positions</div>' +
      '<span class="korra-copytrade-shell__detailBadge">' +
      escapeHtml(formatPlainNumber(openPositionsCount, 0) + " live") +
      "</span>" +
      "</div>" +
      '<div class="korra-copytrade-shell__detailScroll">' +
      '<table class="korra-copytrade-shell__detailTable">' +
      "<thead><tr><th>Symbol</th><th>Side</th><th>Volume</th><th>Open</th><th>Current</th><th>P/L</th></tr></thead>" +
      "<tbody>" +
      buildStatisticsTableRows(positions, [
        {
          render: (item) => escapeHtml(String(item.symbol || "N/A"))
        },
        {
          render: (item) => buildSidePillMarkup(item.side)
        },
        {
          render: (item) => escapeHtml(formatPlainNumber(item.volume, 2))
        },
        {
          render: (item) => escapeHtml(formatPlainNumber(item.openPrice, 5))
        },
        {
          render: (item) => escapeHtml(formatPlainNumber(item.currentPrice, 5))
        },
        {
          className: (item) =>
            Number(item && item.profit) > 0
              ? "korra-copytrade-shell__profit--positive"
              : Number(item && item.profit) < 0
                ? "korra-copytrade-shell__profit--negative"
                : "",
          render: (item) => escapeHtml(formatCurrencyValue(item.profit, currency))
        }
      ]) +
      "</tbody></table></div></div>";
    const historyMarkup =
      '<div class="korra-copytrade-shell__detailCard korra-copytrade-shell__detailCard--history">' +
      '<div class="korra-copytrade-shell__detailCardHeader">' +
      '<div class="korra-copytrade-shell__sectionTitle">' +
      escapeHtml(buildCopyTradeDisplayName(account) + " · Trade History") +
      "</div>" +
      '<span class="korra-copytrade-shell__detailBadge">' +
      escapeHtml(formatPlainNumber(closedHistory.length, 0) + " closed") +
      "</span>" +
      "</div>" +
      '<div class="korra-copytrade-shell__detailScroll">' +
      '<table class="korra-copytrade-shell__detailTable">' +
      "<thead><tr><th>Side</th><th>Symbol</th><th>Volume</th><th>Open</th><th>Close</th><th>Duration</th><th>P&L</th></tr></thead>" +
      "<tbody>" +
      buildStatisticsTableRows(closedHistory, [
        {
          render: (item) => buildSidePillMarkup(item.side)
        },
        {
          render: (item) => escapeHtml(String(item.symbol || "N/A"))
        },
        {
          render: (item) => escapeHtml(formatPlainNumber(item.volume, 2))
        },
        {
          render: (item) => escapeHtml(formatDateTimeLabel(item.openTime))
        },
        {
          render: (item) => escapeHtml(formatDateTimeLabel(item.closeTime))
        },
        {
          render: (item) => escapeHtml(formatTradeDurationLabel(item.openTime, item.closeTime))
        },
        {
          className: (item) =>
            Number(item && item.profit) > 0
              ? "korra-copytrade-shell__profit--positive"
              : Number(item && item.profit) < 0
                ? "korra-copytrade-shell__profit--negative"
                : "",
          render: (item) => escapeHtml(formatCurrencyValue(item.profit, currency))
        }
      ], (item) =>
        Number(item && item.profit) > 0
          ? "korra-copytrade-shell__detailRow--positive"
          : Number(item && item.profit) < 0
            ? "korra-copytrade-shell__detailRow--negative"
            : ""
      ) +
      "</tbody></table></div></div>";

    return (
      header +
      formFeedbackMarkup +
      loadingMarkup +
      errorMarkup +
      metricsMarkup +
      '<div class="korra-copytrade-shell__section">' +
      '<div class="korra-copytrade-shell__detailGrid">' +
      positionsMarkup +
      historyMarkup +
      "</div>" +
      "</div>" +
      (formState && formState.pending
          ? buildCustomCopyTradeLoadingOverlayMarkup("Saving settings...")
          : formState && formState.pausePending
            ? buildCustomCopyTradeLoadingOverlayMarkup("Updating account...")
            : formState && formState.reconnectPending
              ? buildCustomCopyTradeLoadingOverlayMarkup("Reconnecting account...")
              : "")
    );
  };

  const ensureCustomCopyTradeShell = () => {
    let shell = document.getElementById(KORRA_COPYTRADE_SHELL_ID);
    if (!(shell instanceof HTMLElement)) {
      shell = document.createElement("div");
      shell.id = KORRA_COPYTRADE_SHELL_ID;
      shell.hidden = true;
      document.body.appendChild(shell);
    }

    if (shell.dataset.korraBound !== "true") {
      shell.dataset.korraBound = "true";
      shell.addEventListener("click", (event) => {
        const eventTarget = event.target;
        const targetElement =
          eventTarget instanceof Element
            ? eventTarget
            : eventTarget && eventTarget.parentElement instanceof Element
              ? eventTarget.parentElement
              : null;
        const target = targetElement ? targetElement.closest("[data-korra-action]") : null;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const action = String(target.dataset.korraAction || "").trim();
        if (!action) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (action === "add-account") {
          navigateToAddAccountFlow();
          return;
        }

        if (action === "back-home") {
          navigateToCustomCopyTradeHome();
          return;
        }

        if (action === "view-statistics") {
          navigateToCustomCopyTradeStatistics(
            target.dataset.accountId || "",
            target.dataset.providerAccountId || ""
          );
          return;
        }

        if (action === "delete-account") {
          void deleteCustomCopyTradeAccount(target.dataset.accountId || "")
            .then(() => {
              queueEmbeddedUiRefresh();
            })
            .catch((error) => {
              const store = getCustomCopyTradeStore();
              if (isObjectRecord(store.list)) {
                store.list.error = String(
                  (error && error.message) || error || "Failed to delete account."
                );
              }
              queueEmbeddedUiRefresh();
            });
          return;
        }

        if (action === "save-account-settings") {
          void saveCustomCopyTradeAccountSettings(target.dataset.accountId || "");
          return;
        }

        if (action === "toggle-account-pause") {
          void toggleCustomCopyTradeAccountPaused(
            target.dataset.accountId || "",
            String(target.dataset.paused || "").trim() === "true"
          );
          return;
        }

        if (action === "reconnect-account") {
          void reconnectCustomCopyTradeAccount(target.dataset.accountId || "");
          return;
        }

        if (action === "save-preset") {
          saveCopyTradePresetFromFormState(target.dataset.accountId || "");
          return;
        }

        if (action === "load-preset") {
          const accountId = String(target.dataset.accountId || "").trim();
          const formState = getCustomCopyTradeAccountFormState(accountId, null);
          if (
            applyCopyTradePresetToFormState(
              accountId,
              formState ? formState.selectedPresetName : ""
            )
          ) {
            void saveCustomCopyTradeAccountSettings(accountId);
          }
          return;
        }

        if (action === "submit-add-account") {
          void submitCustomCopyTradeAddForm();
          return;
        }
      });

      shell.addEventListener("input", (event) => {
        const target = event.target;
        if (
          !(
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
          )
        ) {
          return;
        }

        const accountField = String(target.dataset.korraAccountField || "").trim();
        const accountId = String(target.dataset.korraAccountId || "").trim();
        if (accountField && accountId) {
          updateCustomCopyTradeAccountFormField(accountId, accountField, target.value);
          return;
        }

        const field = String(target.dataset.korraField || "").trim();
        if (!field) {
          return;
        }

        updateCustomCopyTradeAddFormField(field, target.value);
      });

      shell.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
          return;
        }

        const presetAccountId = String(target.dataset.korraPresetAccountId || "").trim();
        if (!presetAccountId) {
          return;
        }

        event.stopPropagation();
        void handleCustomCopyTradePresetSelection(presetAccountId, target.value);
      });

      shell.addEventListener("submit", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLFormElement)) {
          return;
        }

        if (target.dataset.korraForm !== "add-account") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }

        void submitCustomCopyTradeAddForm();
      });
    }

    return shell;
  };

  const hideCustomCopyTradeChartInteraction = (chartRoot) => {
    if (!(chartRoot instanceof HTMLElement)) {
      return;
    }

    const tooltip = chartRoot.querySelector("[data-korra-chart-tooltip='true']");
    if (tooltip instanceof HTMLElement) {
      tooltip.dataset.visible = "false";
      tooltip.setAttribute("aria-hidden", "true");
    }

    const guide = chartRoot.querySelector("[data-korra-chart-guide='true']");
    if (guide instanceof SVGLineElement) {
      guide.setAttribute("opacity", "0");
    }

    const balanceDot = chartRoot.querySelector("[data-korra-chart-balance-dot='true']");
    if (balanceDot instanceof SVGCircleElement) {
      balanceDot.setAttribute("opacity", "0");
    }

    const equityDot = chartRoot.querySelector("[data-korra-chart-equity-dot='true']");
    if (equityDot instanceof SVGCircleElement) {
      equityDot.setAttribute("opacity", "0");
    }
  };

  const updateCustomCopyTradeChartInteraction = (chartRoot, clientX) => {
    if (!(chartRoot instanceof HTMLElement)) {
      return;
    }

    if (!chartRoot.__korraChartConfig) {
      try {
        chartRoot.__korraChartConfig = JSON.parse(
          String(chartRoot.dataset.korraChartConfig || "{}")
        );
      } catch {
        chartRoot.__korraChartConfig = null;
      }
    }

    const config = chartRoot.__korraChartConfig;
    const points = Array.isArray(config && config.points) ? config.points : [];
    if (!points.length) {
      hideCustomCopyTradeChartInteraction(chartRoot);
      return;
    }

    const hitbox = chartRoot.querySelector("[data-korra-chart-hitbox='true']");
    if (!(hitbox instanceof SVGRectElement)) {
      return;
    }

    const hitboxRect = hitbox.getBoundingClientRect();
    if (!(hitboxRect.width > 0)) {
      return;
    }

    const plotLeft = Number(config.plotLeft || 0);
    const plotRight = Number(config.plotRight || 0);
    const plotTop = Number(config.plotTop || 0);
    const plotBottom = Number(config.plotBottom || 0);
    const ratio = Math.max(0, Math.min(1, (clientX - hitboxRect.left) / hitboxRect.width));
    const targetX = plotLeft + ratio * Math.max(1, plotRight - plotLeft);
    let activePoint = points[0];
    let bestDistance = Math.abs(Number(points[0].x || 0) - targetX);

    for (let index = 1; index < points.length; index += 1) {
      const candidate = points[index];
      const distance = Math.abs(Number(candidate && candidate.x || 0) - targetX);
      if (distance < bestDistance) {
        activePoint = candidate;
        bestDistance = distance;
      }
    }

    if (!activePoint) {
      hideCustomCopyTradeChartInteraction(chartRoot);
      return;
    }

    const guide = chartRoot.querySelector("[data-korra-chart-guide='true']");
    if (guide instanceof SVGLineElement) {
      guide.setAttribute("x1", String(activePoint.x));
      guide.setAttribute("x2", String(activePoint.x));
      guide.setAttribute("y1", String(plotTop));
      guide.setAttribute("y2", String(plotBottom));
      guide.setAttribute("opacity", "0.9");
    }

    const balanceDot = chartRoot.querySelector("[data-korra-chart-balance-dot='true']");
    if (balanceDot instanceof SVGCircleElement) {
      if (Number.isFinite(Number(activePoint.balanceY))) {
        balanceDot.setAttribute("cx", String(activePoint.x));
        balanceDot.setAttribute("cy", String(activePoint.balanceY));
        balanceDot.setAttribute("opacity", "1");
      } else {
        balanceDot.setAttribute("opacity", "0");
      }
    }

    const equityDot = chartRoot.querySelector("[data-korra-chart-equity-dot='true']");
    if (equityDot instanceof SVGCircleElement) {
      if (Number.isFinite(Number(activePoint.equityY))) {
        equityDot.setAttribute("cx", String(activePoint.x));
        equityDot.setAttribute("cy", String(activePoint.equityY));
        equityDot.setAttribute("opacity", "1");
      } else {
        equityDot.setAttribute("opacity", "0");
      }
    }

    const tooltip = chartRoot.querySelector("[data-korra-chart-tooltip='true']");
    if (!(tooltip instanceof HTMLElement)) {
      return;
    }

    const label = tooltip.querySelector("[data-korra-chart-tooltip-label='true']");
    if (label instanceof HTMLElement) {
      label.textContent = formatChartTimeLabel(activePoint.time);
    }

    const balanceValue = tooltip.querySelector("[data-korra-chart-tooltip-balance='true']");
    if (balanceValue instanceof HTMLElement) {
      balanceValue.textContent = formatCurrencyValue(activePoint.balance, config.currency || "USD");
    }

    const equityValue = tooltip.querySelector("[data-korra-chart-tooltip-equity='true']");
    if (equityValue instanceof HTMLElement) {
      equityValue.textContent = formatCurrencyValue(activePoint.equity, config.currency || "USD");
    }

    tooltip.dataset.visible = "true";
    tooltip.setAttribute("aria-hidden", "false");
    const chartRect = chartRoot.getBoundingClientRect();
    const relativeX =
      hitboxRect.left -
      chartRect.left +
      ((Number(activePoint.x || 0) - plotLeft) / Math.max(1, plotRight - plotLeft)) *
      hitboxRect.width;
    const tooltipWidth = tooltip.offsetWidth || 150;
    const minLeft = tooltipWidth / 2 + 8;
    const maxLeft = Math.max(minLeft, chartRoot.clientWidth - tooltipWidth / 2 - 8);
    const tooltipLeft = Math.min(maxLeft, Math.max(minLeft, relativeX));
    tooltip.style.left = tooltipLeft.toFixed(2) + "px";
  };

  const initializeCustomCopyTradeCharts = (container) => {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const chartRoots = container.querySelectorAll("[data-korra-chart-root='true']");
    chartRoots.forEach((node) => {
      if (!(node instanceof HTMLElement) || node.dataset.korraChartBound === "true") {
        return;
      }

      node.dataset.korraChartBound = "true";
      const handlePointerMove = (event) => {
        if (!(event instanceof PointerEvent)) {
          return;
        }
        updateCustomCopyTradeChartInteraction(node, event.clientX);
      };

      node.addEventListener("pointerenter", handlePointerMove);
      node.addEventListener("pointermove", handlePointerMove);
      node.addEventListener("pointerleave", () => {
        hideCustomCopyTradeChartInteraction(node);
      });
      node.addEventListener("pointercancel", () => {
        hideCustomCopyTradeChartInteraction(node);
      });
    });
  };

  const renderCustomCopyTradeShell = () => {
    const existingShell = document.getElementById(KORRA_COPYTRADE_SHELL_ID);
    if (!isCustomCopyTradeShellRoute()) {
      teardownCustomCopyTradeSummaryStream();
      if (existingShell) {
        existingShell.remove();
      }
      document.body.style.background = "#ffffff";
      document.documentElement.style.background = "#ffffff";
      return;
    }

    const shell = ensureCustomCopyTradeShell();
    const routeState = readCustomCopyTradeViewState();
    if (routeState.view !== KORRA_COPYTRADE_ADD_VIEW) {
      ensureCustomCopyTradeSummaryStream();
    }
    const markup =
      routeState.view === KORRA_COPYTRADE_STATS_VIEW
        ? buildCustomCopyTradeStatisticsMarkup(
            routeState.accountId,
            routeState.providerAccountId
          )
        : routeState.view === KORRA_COPYTRADE_ADD_VIEW
          ? buildCustomCopyTradeAddAccountMarkup()
          : buildCustomCopyTradeListMarkup();

    if (shell.__korraMarkup !== markup) {
      shell.innerHTML = markup;
      shell.__korraMarkup = markup;
    }

    initializeCustomCopyTradeCharts(shell);
    shell.hidden = false;
    document.body.style.background = "#040404";
    document.documentElement.style.background = "#040404";
  };

  const findCommonAncestor = (nodes) => {
    if (!nodes.length) {
      return null;
    }

    const ancestors = [];
    let current = nodes[0];
    while (current) {
      ancestors.push(current);
      current = current.parentElement;
    }

    return ancestors.find((candidate) => nodes.every((node) => candidate.contains(node))) || null;
  };

  const hidePrimarySidebar = () => {
    const drawer = document.querySelector("[data-testid='drawer']");
    if (!drawer) {
      return;
    }

    const sectionLinks = [
      drawer.querySelector("a[href='/backtesting']"),
      drawer.querySelector("a[href='/mentor/mentor-mode']"),
      drawer.querySelector("a[href='/university']")
    ].filter(Boolean);

    if (sectionLinks.length !== 3) {
      return;
    }

    let navigation = findCommonAncestor(sectionLinks);
    while (navigation && navigation !== drawer && navigation.tagName !== "NAV") {
      navigation = navigation.parentElement;
    }

    const mainSection =
      navigation && navigation.parentElement instanceof HTMLElement
        ? navigation.parentElement
        : null;
    if (!mainSection || mainSection.dataset.korraPrimaryRailHidden === "true") {
      return;
    }

    mainSection.dataset.korraPrimaryRailHidden = "true";
    mainSection.style.display = "none";
    mainSection.style.width = "0";
    mainSection.style.minWidth = "0";
    mainSection.style.flex = "0 0 0";

    const secondarySection =
      mainSection.nextElementSibling instanceof HTMLElement ? mainSection.nextElementSibling : null;
    if (secondarySection) {
      secondarySection.style.borderLeft = "0";
      secondarySection.style.marginLeft = "0";
    }
  };

  const hideWrappedPanels = () => {
    const headings = Array.from(document.querySelectorAll("body *")).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      return /^Your 2025 .+ Persona$/i.test(normalizeNodeText(node.textContent));
    });

    headings.forEach((heading) => {
      let current = heading;
      for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
        const text = normalizeNodeText(current.textContent);
        const rect = current.getBoundingClientRect();
        const isWrappedCard =
          text.includes("Your 2025") &&
          text.includes("Persona") &&
          (text.includes("2026 Challenge: Become") ||
            text.includes("Time Spent Backtesting") ||
            text.includes("Time Spent Journaling") ||
            text.includes("Time Spent Trading")) &&
          rect.width >= 260 &&
          rect.height >= 160;

        if (isWrappedCard) {
          current.style.display = "none";
          current.setAttribute("data-korra-hidden-wrapped", "true");
          break;
        }

        current = current.parentElement;
      }
    });
  };

  const refreshEmbeddedUi = () => {
    persistAuthHeaders();
    enforceEmbeddedRoute();
    applyLocalAccountUiGuards();
    normalizeMt5ImportMethodLayout();
    simplifyInlineMt5ConnectLayout();
    ensureInlineMt5ConnectFeedback();
    redirectBaseAddTradeLinksToMt5();
    renderCustomCopyTradeShell();
    hidePrimarySidebar();
    hideWrappedPanels();
  };

  let refreshEmbeddedUiQueued = false;

  const queueEmbeddedUiRefresh = () => {
    if (refreshEmbeddedUiQueued) {
      return;
    }

    refreshEmbeddedUiQueued = true;
    window.requestAnimationFrame(() => {
      refreshEmbeddedUiQueued = false;
      refreshEmbeddedUi();
    });
  };

  const enforceEmbeddedRoute = () => {
    if (window.location.pathname.startsWith("/auth/")) {
      nativeReplaceState(history.state, "", lastEmbeddedPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    const normalized = normalizeEmbeddedPath(window.location.href);
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (normalized && normalized !== current) {
      nativeReplaceState(history.state, "", normalized);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  rememberEmbeddedPath(window.location.href);
  refreshEmbeddedUi();
  window.addEventListener("popstate", queueEmbeddedUiRefresh);

  if (
    window.CanvasRenderingContext2D &&
    CanvasRenderingContext2D.prototype &&
    !CanvasRenderingContext2D.prototype.__copytradeDrawImageGuard
  ) {
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;

    CanvasRenderingContext2D.prototype.drawImage = function guardedDrawImage(...args) {
      const image = args[0];
      const isBrokenHtmlImage =
        typeof HTMLImageElement !== "undefined" &&
        image instanceof HTMLImageElement &&
        image.complete &&
        image.naturalWidth === 0;
      const isBrokenBitmap =
        typeof ImageBitmap !== "undefined" &&
        image instanceof ImageBitmap &&
        (image.width === 0 || image.height === 0);

      if (isBrokenHtmlImage || isBrokenBitmap) {
        return;
      }

      try {
        return nativeDrawImage.apply(this, args);
      } catch (error) {
        const message = String((error && error.message) || error || "");
        if (message.includes("broken state")) {
          return;
        }
        throw error;
      }
    };

    CanvasRenderingContext2D.prototype.__copytradeDrawImageGuard = true;
  }

  history.pushState = function pushState(state, unused, url) {
    if (url && isAuthRoute(url)) {
      return nativePushState(state, unused, lastEmbeddedPath);
    }
    if (url) {
      rememberEmbeddedPath(url);
    }
    return nativePushState(state, unused, normalizeEmbeddedPath(url) || url);
  };

  history.replaceState = function replaceState(state, unused, url) {
    if (url && isAuthRoute(url)) {
      return nativeReplaceState(state, unused, lastEmbeddedPath);
    }
    if (url) {
      rememberEmbeddedPath(url);
    }
    return nativeReplaceState(state, unused, normalizeEmbeddedPath(url) || url);
  };

  if (nativeOpen) {
    window.open = function open(url, name, features) {
      if (shouldInterceptInlineMt5Connect(url, features)) {
        return createInlineMt5PopupHandle();
      }

      return nativeOpen(url, name, features);
    };
  }

  if (nativeFetch) {
    window.fetch = (input, init) => {
      const requestUrl =
        typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const method = (init && init.method) || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET";

      if (isTradezellaApiRequest(requestUrl) || isMarketDataProxyRequest(requestUrl)) {
        persistAuthHeaders();
        const bodyPromise =
          init && Object.prototype.hasOwnProperty.call(init, "body")
            ? Promise.resolve(init.body)
            : typeof Request !== "undefined" && input instanceof Request
              ? input
                  .clone()
                  .text()
                  .catch(() => null)
              : Promise.resolve(null);

        return bodyPromise.then((requestBody) =>
          createAsyncMockResponse(requestUrl, method.toUpperCase(), requestBody).then(
            (mockResponse) =>
              new Response(mockResponse.responseText, {
                status: mockResponse.status,
                statusText: mockResponse.statusText,
                headers: mockResponse.headers
              })
          )
        );
      }

      return nativeFetch(input, init);
    };
  }

  class EmbeddedCopytradeXHR {
    constructor() {
      this._xhr = new NativeXHR();
      this._listeners = new Map();
      this._requestHeaders = {};
      this._method = "GET";
      this._url = "";
      this._mockResponse = null;
      this._shortCircuit = false;
      this._readyState = 0;
      this.onreadystatechange = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
      this.onabort = null;
      this.ontimeout = null;
      this.onprogress = null;
      this.upload = this._xhr.upload;

      LISTENER_EVENTS.forEach((type) => {
        this._xhr.addEventListener(type, (event) => {
          this._emit(type, event);
        });
      });
    }

    _emit(type, event) {
      const handler = this["on" + type];
      if (typeof handler === "function") {
        handler.call(this, event);
      }

      const listeners = this._listeners.get(type);
      if (!listeners) {
        return;
      }

      listeners.forEach((listener) => {
        listener.call(this, event);
      });
    }

    _setMockResponse(mockResponse) {
      this._mockResponse = {
        ...mockResponse,
        headerLookup: Object.fromEntries(
          Object.entries(mockResponse.headers).map(([key, value]) => [
            key.toLowerCase(),
            String(value)
          ])
        )
      };
      this._readyState = 4;
    }

    addEventListener(type, listener) {
      const listeners = this._listeners.get(type) || new Set();
      listeners.add(listener);
      this._listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      const listeners = this._listeners.get(type);
      if (!listeners) {
        return;
      }

      listeners.delete(listener);
    }

    open(method, url, async, user, password) {
      persistAuthHeaders();
      this._method = String(method || "GET").toUpperCase();
      this._url = String(url);
      this._mockResponse = null;
      this._shortCircuit =
        isTradezellaApiRequest(this._url) || isMarketDataProxyRequest(this._url);

      if (this._shortCircuit) {
        this._readyState = 1;
        this._emit("readystatechange", new Event("readystatechange"));
        return;
      }

      this._xhr.open(method, url, async, user, password);
    }

    send(body) {
      if (this._shortCircuit) {
        createAsyncMockResponse(this._url, this._method, body).then((mockResponse) => {
          this._setMockResponse(mockResponse);
          window.setTimeout(() => {
            this._emit("readystatechange", new Event("readystatechange"));
            this._emit("load", new Event("load"));
            this._emit("loadend", new Event("loadend"));
          }, 0);
        });
        return;
      }

      this._xhr.send(body);
    }

    abort() {
      if (this._shortCircuit) {
        this._emit("abort", new Event("abort"));
        this._emit("loadend", new Event("loadend"));
        return;
      }

      this._xhr.abort();
    }

    setRequestHeader(name, value) {
      if (this._shortCircuit) {
        this._requestHeaders[String(name).toLowerCase()] = String(value);
        return;
      }

      this._xhr.setRequestHeader(name, value);
    }

    getAllResponseHeaders() {
      if (this._mockResponse) {
        return Object.entries(this._mockResponse.headers)
          .map(([key, value]) => key + ": " + value)
          .join("\\r\\n");
      }

      return this._xhr.getAllResponseHeaders();
    }

    getResponseHeader(name) {
      if (this._mockResponse) {
        return this._mockResponse.headerLookup[String(name).toLowerCase()] || null;
      }

      return this._xhr.getResponseHeader(name);
    }

    overrideMimeType(value) {
      if (this._shortCircuit) {
        this._overrideMimeType = value;
        return;
      }

      this._xhr.overrideMimeType(value);
    }

    get readyState() {
      return this._mockResponse ? this._readyState : this._xhr.readyState;
    }

    get status() {
      return this._mockResponse ? this._mockResponse.status : this._xhr.status;
    }

    get statusText() {
      return this._mockResponse ? this._mockResponse.statusText : this._xhr.statusText;
    }

    get responseText() {
      return this._mockResponse ? this._mockResponse.responseText : this._xhr.responseText;
    }

    get response() {
      return this._mockResponse ? this._mockResponse.responseText : this._xhr.response;
    }

    get responseURL() {
      return this._mockResponse ? this._url : this._xhr.responseURL;
    }

    get responseXML() {
      return this._mockResponse ? null : this._xhr.responseXML;
    }

    get responseType() {
      return this._xhr.responseType;
    }

    set responseType(value) {
      this._xhr.responseType = value;
    }

    get timeout() {
      return this._xhr.timeout;
    }

    set timeout(value) {
      this._xhr.timeout = value;
    }

    get withCredentials() {
      return this._xhr.withCredentials;
    }

    set withCredentials(value) {
      this._xhr.withCredentials = value;
    }
  }

  EmbeddedCopytradeXHR.UNSENT = 0;
  EmbeddedCopytradeXHR.OPENED = 1;
  EmbeddedCopytradeXHR.HEADERS_RECEIVED = 2;
  EmbeddedCopytradeXHR.LOADING = 3;
  EmbeddedCopytradeXHR.DONE = 4;

  window.XMLHttpRequest = EmbeddedCopytradeXHR;

  new MutationObserver(() => {
    queueEmbeddedUiRefresh();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
`;

export function createCopytradeDashboardResponse() {
  const html = `<!DOCTYPE html>
<html lang="en" style="height:100%;background:#040404;color-scheme:dark;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Copy Trade Dashboard</title>
    <link rel="stylesheet" href="/copytrade/dashboard.css" />
    <style>${injectedCss}</style>
  </head>
  <body style="background:#040404;color-scheme:dark;">
    <div id="root" style="height:100%;background:#040404;"></div>
    <script>${injectedScript}</script>
    <script src="/copytrade/dashboard.js" defer></script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
