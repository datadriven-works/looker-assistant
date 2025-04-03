application: assistant {
  label: "Assistant (Dev)"
  url: "https://localhost:8080/bundle.js"
  mount_points: {
    dashboard_vis: yes
    dashboard_tile: yes
    standalone: yes
  }
   entitlements: {
    local_storage:  yes
    use_embeds: yes
    navigation: yes
    use_iframes: yes
    new_window: yes

    core_api_methods: [
    "me", "all_lookml_models","dashboard","dashboard_dashboard_elements", "lookml_model_explore", "run_inline_query"
    ]
    external_api_urls: [
      "https://localhost:8080/bundle.js",
      "https://localhost:8080/bundle-version",
      "https://XXXX.cloudfunctions.net/gemini-backend-api"
    ]
    oauth2_urls: []
  }
}
