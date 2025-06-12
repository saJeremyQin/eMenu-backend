
// enable use_lockfile to avoid state file being applied at the same tim
terraform {
  backend "s3" {
    bucket       = "emenu-terraform-state-bucket"
    key          = "env/dev/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true  
  }
}


// set region
provider "aws" {
  region = "ap-southeast-2"
}
