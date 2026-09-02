#!/usr/bin/env bash
set -euo pipefail

project="${MATRIX_GCP_PROJECT:-inquiry-institute}"
configuration="${MATRIX_GCLOUD_CONFIGURATION:-inquiry-institute}"
salon_check_display='Villa Diodati Salon production'
salon_policy_display='Villa Diodati Salon unavailable'
health_policy_display='Matrix consolidation witness missing'

if [[ "$project" != 'inquiry-institute' ]]; then
  echo "Monitoring must be configured in inquiry-institute" >&2
  exit 2
fi

salon_check_name="$(gcloud monitoring uptime list-configs \
  --configuration="$configuration" --project="$project" \
  --filter="displayName='${salon_check_display}'" --format='value(name)' | head -n 1)"

if [[ -z "$salon_check_name" ]]; then
  gcloud monitoring uptime create "$salon_check_display" \
    --configuration="$configuration" --project="$project" \
    --resource-type=uptime-url \
    --resource-labels="host=salon.castalia.institute,project_id=${project}" \
    --protocol=https --port=443 --path=/diodati/ --request-method=get \
    --validate-ssl=true --status-classes=2xx \
    --matcher-content='Villa Diodati' --matcher-type=contains-string \
    --period=1 --timeout=10 \
    --regions=usa-iowa,usa-oregon,usa-virginia,europe,asia-pacific >/dev/null
  salon_check_name="$(gcloud monitoring uptime list-configs \
    --configuration="$configuration" --project="$project" \
    --filter="displayName='${salon_check_display}'" --format='value(name)' | head -n 1)"
fi
test -n "$salon_check_name"
salon_check_id="${salon_check_name##*/}"

existing_salon_policy="$(gcloud monitoring policies list \
  --configuration="$configuration" --project="$project" \
  --filter="displayName='${salon_policy_display}'" --format='value(name)' | head -n 1)"
if [[ -z "$existing_salon_policy" ]]; then
  salon_policy="$(jq -nc \
    --arg display "$salon_policy_display" \
    --arg check_id "$salon_check_id" \
    '{
      displayName:$display,
      enabled:true,
      combiner:"OR",
      conditions:[{
        displayName:"Salon failed from most uptime checkers",
        conditionThreshold:{
          filter:("resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"" + $check_id + "\""),
          aggregations:[{
            alignmentPeriod:"60s",
            perSeriesAligner:"ALIGN_NEXT_OLDER",
            crossSeriesReducer:"REDUCE_FRACTION_TRUE",
            groupByFields:["resource.label.host"]
          }],
          comparison:"COMPARISON_LT",
          thresholdValue:0.5,
          duration:"120s",
          trigger:{count:1}
        }
      }],
      alertStrategy:{autoClose:"604800s"},
      documentation:{
        mimeType:"text/markdown",
        content:"The Villa Diodati Salon page failed from a majority of configured regions for at least two minutes. Verify Salon Pages deployment and canonical Matrix health. Attach an approved notification channel before relying on active paging."
      }
    }')"
  gcloud monitoring policies create --configuration="$configuration" --project="$project" \
    --policy="$salon_policy" >/dev/null
fi

existing_health_policy="$(gcloud monitoring policies list \
  --configuration="$configuration" --project="$project" \
  --filter="displayName='${health_policy_display}'" --format='value(name)' | head -n 1)"
if [[ -z "$existing_health_policy" ]]; then
  health_policy="$(jq -nc --arg display "$health_policy_display" '{
    displayName:$display,
    enabled:true,
    combiner:"OR",
    conditions:[{
      displayName:"No successful consolidation witness for two hours",
      conditionAbsent:{
        filter:"resource.type = \"gce_instance\" AND metric.type = \"custom.googleapis.com/castalia/matrix_consolidation_healthy\"",
        duration:"7200s",
        trigger:{count:1}
      }
    }],
    alertStrategy:{autoClose:"604800s"},
    documentation:{
      mimeType:"text/markdown",
      content:"The canonical Matrix VM has not emitted a successful consolidation witness for two hours. Check matrix-consolidation-health.service, Matrix/PostgreSQL, Diodati services, and backup freshness. Attach an approved notification channel before relying on active paging."
    }
  }')"
  gcloud monitoring policies create --configuration="$configuration" --project="$project" \
    --policy="$health_policy" >/dev/null
fi

channel_count="$(gcloud alpha monitoring channels list \
  --configuration="$configuration" --project="$project" \
  --format='value(name)' | wc -l | tr -d ' ')"

echo "Salon uptime check: ${salon_check_id}"
echo "Monitoring policies present: ${salon_policy_display}; ${health_policy_display}"
if [[ "$channel_count" = '0' ]]; then
  echo "Warning: no approved notification channel exists; incidents are console-visible only" >&2
fi
