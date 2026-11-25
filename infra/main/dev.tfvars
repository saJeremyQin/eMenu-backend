environment = "dev"
account_id  = "205930647566"
admin_url   = "http://localhost:5173"

# Send from our own domain: emenu.au has DKIM and a custom MAIL FROM in SES, so mail passes
# SPF/DKIM/DMARC. (A hotmail.com sender via SES fails them and gets filtered as spam.)
cognito_email = {
  from         = "eMenu <noreply@emenu.au>"
  ses_identity = "emenu.au"
}

invite_from_email = "noreply@emenu.au"
